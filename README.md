# CrewLink — Member Callout

CrewLink helps union leaders share announcements with their members. Leaders can write messages with optional AI help, review and approve them, and send simulated notifications. Members can read announcements, acknowledge them, and RSVP to events.

This project runs locally with Docker. Notifications are simulated, so no real messages are sent to members.

## What you can do

**As a leader:**
- See your local's members and announcements.
- Write an announcement yourself or generate a draft with AI.
- Edit, submit, approve, and send announcements.
- Follow delivery progress and see who has read, acknowledged, or RSVP'd.

**As a member:**
- See only announcements addressed to you.
- Read and acknowledge messages.
- RSVP **Yes**, **No**, or **Maybe** when an announcement allows it.

Each union local has its own data. A member or leader from one local cannot access another local's announcements.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | Next.js 16, React |
| API | Node.js, Express (two instances) |
| Reverse proxy | Nginx |
| Database | PostgreSQL, Prisma |
| Background jobs | Redis, BullMQ |
| AI drafting | Local mock mode or OpenRouter |
| Local setup | Docker Compose |

## Architecture

- Next.js 16 App Router frontend with secure session management and an API proxy on port `3000`.
- Two stateless Express API instances behind Nginx on port `8080`.
- PostgreSQL/Prisma for tenant data, recipient snapshots, transactional outbox, dispatches, and audits.
- Redis/BullMQ with an independent notification worker.
- Offline mock AI or optional server-side OpenRouter drafting.


![CrewLink runtime and reliable notification architecture](./architecture.svg)

Next.js handles the web interface and keeps the login token in an HttpOnly cookie. Nginx balances requests between two Express API instances. PostgreSQL stores announcements, recipient snapshots, the transactional outbox, dispatches, and engagement data. An outbox publisher in each API process discovers committed work and adds per-recipient jobs to Redis/BullMQ. The independent worker records simulated dispatches, finalizes completed announcements, and periodically reconciles stale `SENDING` announcements.

## Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2.
- Node.js 22+ and npm for host-side development and tests. You do not need them to run the Docker application.

## Run CrewLink

1. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

   The example uses local development settings and mock AI. Set a strong, unique `JWT_SECRET` before using CrewLink outside a local demo. If you already have a PostgreSQL data volume, keep the database credentials that match it.

2. Build and start everything:

   ```bash
   docker compose up --build -d
   docker compose ps
   ```

   Docker starts PostgreSQL, Redis, the database migrations and sample data, two APIs, the notification worker, Nginx, and Next.js.

3. Open the application:

   - **Web app:** http://localhost:3000
   - **API health:** http://localhost:8080/health
   - **Swagger API docs (if enabled):** http://localhost:8080/api/docs
   - **OpenAPI 3.1 JSON (if enabled):** http://localhost:8080/api/openapi.json

   Check the containers with:

   ```bash
   docker compose ps -a
   ```

To stop the app without deleting your database:

```bash
docker compose down
```

**Do not use `docker compose down -v`** unless you intentionally want to erase stored development data.

## Try it out

### Leader walkthrough

1. Log in at http://localhost:3000/login using `leader28@example.test` and the password below.
2. Open **Announcements** and create a new draft.
3. Optionally select **Generate AI Draft**, then review and edit the result.
4. Save the draft, submit it for approval, and approve it.
5. Select **Send** and watch the simulated delivery progress.
6. Open the announcement to view delivery and engagement statistics.

### Member walkthrough

1. Log out and sign in as `member28@example.test`.
2. Open your inbox and select an announcement addressed to you.
3. Opening the detail records the first read time. Acknowledging an unread announcement also marks it read, without replacing an earlier read time.
4. If RSVP is enabled, choose **Yes**, **No**, or **Maybe**.
5. Log in as the leader again to see the updated engagement counts.

> **Note:** AI creates a draft only. A leader must still review and approve it before sending. Simulated delivery means a dispatch was recorded, not that a real SMS, email, or push notification was delivered.

## AI drafting

The project works without an external AI service. The default `.env` settings are:

```env
AI_DRAFT_MODE=mock
OPENROUTER_API_KEY=
```

To try live drafting, change your local `.env` file to:

```env
AI_DRAFT_MODE=openrouter
OPENROUTER_API_KEY=your_new_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Then recreate the API containers so they read the new values:

```bash
docker compose up -d --force-recreate api1 api2
```

OpenRouter requests may incur charges. Keep API keys out of Git, screenshots, and frontend environment variables.

## API documentation

If Swagger is enabled in your current backend build, open **http://localhost:8080/api/docs** to explore the API. The machine-readable OpenAPI 3.1 specification is available at **http://localhost:8080/api/openapi.json**. For protected endpoints, first call `POST /api/auth/login` using a test account, then use Swagger's **Authorize** button with the returned JWT.

The API includes authentication, member directory, AI drafting, announcement approval and sending, delivery status, inbox interactions, RSVP, and engagement reporting. Express checks the user's role and union local on every protected operation.

Representative command-line example:

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"leader27@example.test","password":"CrewLink27Leader!"}'

curl http://localhost:8080/api/auth/me \
  -H 'Authorization: Bearer YOUR_RETURNED_JWT'
```

Leader lifecycle endpoints are `POST /api/announcements`, `POST /api/announcements/:id/submit`, `POST /api/announcements/:id/approve`, and `POST /api/announcements/:id/send`. Members use `GET /api/member/announcements`, `POST /api/member/announcements/:id/read`, `POST /api/member/announcements/:id/acknowledge`, and `PUT /api/member/announcements/:id/rsvp`. Swagger contains the validated request bodies, responses, status codes, and role requirements.

## Running tests (optional)

The test database is separate from the normal application and is **not** started by `docker compose up`.

From the project root, install dependencies and start the isolated test database:

```bash
npm install
cp .env.test.example .env.test
npm run test:db:up
```

Run the checks:

```bash
npm run check:web
npm run test:web
npm run build
npm test
npm run test:integration
npm run test:security
npm run test:phase4
npm run test:phase5
(cd apps/api && node --test tests/ai-drafting.test.js)
```

The opt-in scale check creates a 22,400-member test audience and verifies one recipient snapshot and one outbox intent per member. It does not claim a full provider-delivery throughput benchmark:

```bash
npm run test:scale
```

When finished:

```bash
npm run test:db:down
```

Integration tests reset **only** the isolated `crewlink_test` database. Never point `TEST_DATABASE_URL` at your normal development database.

## Host-based development

After `npm install`, use host-reachable data-service URLs and start each process independently:

```bash
export DATABASE_URL='postgresql://crewlink:crewlink_dev_password@localhost:5433/crewlink?schema=public'
export REDIS_URL='redis://localhost:6379'
export JWT_SECRET='replace-with-at-least-32-random-characters'
export JWT_EXPIRES_IN='1h'
npm run dev:api
```

Run `npm run start:worker` and `npm run dev:web` in separate terminals. If Redis remains Docker-only, either run the worker in Docker or temporarily expose Redis only on localhost; do not use Docker service names such as `postgres` or `redis` from host processes.

## Sample data

The seed creates two fictional union locals, four demo login accounts, and a previously sent announcement:

- **Local 27:** 2,000 members.
- **Local 28:** 200 members (180 active).
- **Local 27 demo announcement:** 500 recipients with simulated deliveries.

The seed is safe to rerun and does not remove announcements you create during normal use.

## A few important details

- **Tenant isolation:** Every announcement and member action is scoped to the signed-in user's union local.
- **Approval:** Drafts cannot be sent until a leader explicitly approves them.
- **Reliable delivery:** Recipient snapshots, the database outbox, and unique dispatch records prevent duplicate simulated sends; recovery logic can finish interrupted jobs.
- **Engagement:** Reading, acknowledgment, and RSVP are tracked separately from delivery. Acknowledgment implies read, but read never implies acknowledgment.
- **Offline use:** Mock AI and simulated delivery work without cloud services, but the browser does not offer offline inbox caching or queued offline actions.
- **Security limitation:** PostgreSQL row-level security is not enabled; tenant rules are enforced by database constraints and application queries.
- **Dependency note:** The Phase 7 audit reported four high-severity `npm audit --omit=dev` findings in the Prisma 6 CLI/configuration dependency chain. A major Prisma 7 upgrade was deferred; reassess this before any public deployment.

For the reasoning behind these choices, see [DESIGN.md](./DESIGN.md).

## Test Accounts

These credentials are fictional and are only for local demonstration.

```json
{
  "local27": {
    "leader": {
      "email": "leader27@example.test",
      "password": "CrewLink27Leader!"
    },
    "member": {
      "email": "member27@example.test",
      "password": "CrewLink27Member!"
    }
  },
  "local28": {
    "leader": {
      "email": "leader28@example.test",
      "password": "CrewLink28Leader!"
    },
    "member": {
      "email": "member28@example.test",
      "password": "CrewLink28Member!"
    }
  },
  "sentAnnouncementId": "27000000-aaaa-4000-8000-000000000001",
  "local28MemberId": "28000000-bbbb-4000-8000-000000000001",
  "authenticationStyle": "JWT Bearer token using HS256",
  "loginEndpoint": {
    "method": "POST",
    "path": "/api/auth/login",
    "auth": "public"
  },
  "currentUserEndpoint": {
    "method": "GET",
    "path": "/api/auth/me",
    "auth": "Bearer token required"
  }
}
```
