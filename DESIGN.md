# Part 0: Requirements

## What I'm building

CrewLink helps union leaders share important announcements with members across 43 locals. Leaders can use AI to prepare a draft, review and approve it, and send it to the right members. Members can read, acknowledge, and RSVP to announcements when applicable.

### Assumptions

- Each local can access only its own members and announcements.
- “Immediately” means the send process starts as soon as the leader confirms it; delivery happens in the background.
- Acknowledgment and RSVP are separate, optional features that leaders configure per announcement.
- Sending is finished when every notification attempt has reached a final state, not when everyone has read the message.

### Concerns

AI-generated text could be inaccurate, and a retry or crash could lead to missed or duplicate notifications. I therefore require human approval before sending and keep notification work in the database so it can be recovered.

### Questions I'd ask Denise

1. **Is there a specific delivery-time target?** I assumed processing must start promptly, without a guaranteed deadline for every recipient.
2. **Should members always confirm attendance?** I assumed RSVP is optional and separate from acknowledging a message.
3. **How should members receive announcements—SMS, push notifications, or both?** I assumed channel choice would be decided later; this assessment simulates notification delivery.

## Part A: The Design

### 1. Data model

I used PostgreSQL with Prisma because announcements, recipients, and member responses need reliable relationships and database constraints.

| Table | Important fields | Purpose |
|---|---|---|
| `Local` | `id`, `name` | Represents a union local. |
| `User` | `id`, `localId`, `email`, `passwordHash`, `role` | Handles login and leader/member roles. |
| `Member` | `id`, `localId`, `userId`, `classification` | Stores membership and targeting information. |
| `Announcement` | `id`, `localId`, `title`, `body`, `status`, `needsAck`, `rsvpEnabled`, `approvedAt`, `sentAt` | Stores content and approval/sending state. |
| `AnnouncementRecipient` | `announcementId`, `memberId`, `deliveryStatus`, `readAt`, `acknowledgedAt`, `rsvpStatus` | Records the audience and each person's actions. |
| `NotificationOutbox` | `recipientId`, `status`, `attemptCount` | Stores pending notification work durably. |
| `NotificationDispatch` | `recipientId` | Records a simulated dispatch, once per recipient. |
| `AuditLog` | `localId`, `action`, `createdAt` | Tracks important system actions. |

When a leader sends an announcement, the system saves a **snapshot** of its recipients. New members added afterward are not silently included in that send.

Each recipient's response is tracked independently. Empty read, acknowledgment, and RSVP fields mean no action yet. `readAt` records the first read; `acknowledgedAt` records acknowledgment; and RSVP can be `YES` (coming), `NO` (can't attend), or `MAYBE` (unsure). Reading does not imply acknowledgment. Acknowledging does imply that the member read the message, so it fills an empty `readAt` without overwriting an earlier timestamp. Neither action implies an RSVP.

I chose a recipient table instead of embedding member IDs in an announcement because it makes individual tracking, reporting, and duplicate prevention much easier.

### 2. The send path

Imagine a leader presses **Send** at 14:02 for 22,400 members.

**First, the API handles the request.** Nginx forwards it to one of two Express instances. The API checks the user's identity, role, local, and the announcement's approval status. Inside a PostgreSQL transaction, it marks the announcement `SENDING`, saves the recipient snapshot, and creates one outbox entry per recipient. Unique database constraints make repeated send requests safe.

Once that transaction commits, the API returns **202 Accepted** with the sending status and recipient count. Leadership does **not** wait for 22,400 notifications to complete. The initial request still has to create the snapshot and outbox entries, so I would measure its latency under full load rather than promise a number I haven't tested.

**Next, background processing takes over.** A bounded outbox publisher in each API process sends committed pending or stale work to Redis/BullMQ using the outbox UUID as the per-recipient job ID. A separate worker handles each job and writes a simulated dispatch record to PostgreSQL. If Redis is down, the outbox remains in the database for later retry. Row locks and unique dispatch constraints make concurrent or repeated processing safe.

As work finishes, the system updates recipient and outbox statuses in one transaction, then attempts announcement finalization after commit. Once every outbox row reaches a final outcome, the announcement becomes `SENT`, or `FAILED` if any row exhausted its retries. The worker's bounded reconciliation poll can recover an announcement left in `SENDING` if a process crashes after the final dispatch commit.

**Meanwhile, the UI checks progress.** The Next.js page polls the status endpoint at a bounded interval, and stops when sending finishes. Four people with the page open will still make separate requests, but not every second. At a larger production scale, I would add a short-lived shared cache or server-sent events so many viewers do not repeatedly trigger the same database counts.

I chose this database-backed background workflow instead of sending within the HTTP request, which could take too long or fail midway. The 22,400-member audience is a design target; a full-scale benchmark remains future work. Also, “sent” here means **simulated dispatch**, not proof that a real phone received anything.

### 3. The two rules, by design

**Rule 1 — People only see and do what they're allowed to.**

Every user belongs to a local and has a `LEADER` or `MEMBER` role. The Express API checks authentication by default, with role checks for leader and member endpoints. Service queries are scoped to the authenticated local. A member can only interact with announcements that have a recipient record belonging to them; supplying another person's ID does not change that.

If someone adds a new `/api` endpoint next year and forgets authentication, the parent router still requires a valid user by default. But authentication alone is not enough: a developer must also apply the right role and tenant checks in the service. Cross-local and ownership integration tests help catch mistakes. For stronger defense in production, I would also consider PostgreSQL row-level security.

To find violations, I would monitor suspicious authorization patterns and review audit logs. Automated security tests should run on every change, with alerts for unusual cross-tenant access attempts.

**Rule 2 — A recipient must not get a duplicate simulated dispatch.**

The UI button is not the protection. PostgreSQL uniqueness constraints prevent the same announcement/member recipient, outbox intent, or simulated dispatch from being inserted twice. The database remains the source of truth even when requests hit different API instances, a queue job is retried, or a worker restarts. The durable outbox makes unfinished work recoverable.

I chose this over relying only on BullMQ job IDs or Redis locks, because retries and crashes are normal in background systems. In production, I would monitor repeated job failures, announcements stuck in `SENDING`, and inconsistencies between recipient, outbox, and dispatch totals. These are warning signs that delivery or reconciliation needs attention.

There is an important limit: CrewLink prevents duplicate **persisted simulated dispatches**. Exactly-once delivery through an external SMS or push provider would need provider-side idempotency and careful reconciliation too.

### 4. Architecture diagram

See [architecture.svg](./architecture.svg). It shows the browser, Next.js secure API proxy, Nginx, both Express instances, PostgreSQL transactional outbox, API-hosted outbox publishers, Redis/BullMQ, and the worker's delivery/finalization reconciliation path.

## What I Left Out and What I'd Do Next

I focused on making the core workflow reliable and easy to demonstrate rather than building every production feature.

- **Real SMS/push notifications:** Delivery is simulated. I would integrate a provider once channel requirements and costs are agreed.
- **Production monitoring:** Logs and audit records exist, but I would add operational dashboards and alerts for failures, backlogs, and unusual access.
- **Database row-level security:** Tenant isolation currently lives in the API and database relationships. RLS would add another layer of protection.
- **Full-scale performance testing:** An opt-in PostgreSQL integration scenario verifies creation and repeat-send idempotency for a 22,400-recipient snapshot and outbox. End-to-end BullMQ/provider throughput and status-query load still require a controlled benchmark before setting service-level targets.
- **Browser offline access:** Mock AI works without an external AI service, but members still need a connection to the CrewLink server. Offline access and synchronization could come later.

### Production scaling

- **Load balancing:** I used Nginx with two Express API instances to show how requests can be distributed across servers.
- **Managed hosting:** In production, I would consider DigitalOcean App Platform or AWS App Runner to simplify deployment and infrastructure management.
- **Autoscaling:** Instead of always running two API instances, I would scale the number of instances up or down based on demand. Load balancing and autoscaling work together; they are not replacements for each other.
- **Monitoring:** I would measure traffic, response times, and worker performance before choosing scaling thresholds.
