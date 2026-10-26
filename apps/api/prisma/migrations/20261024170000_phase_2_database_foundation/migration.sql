-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LEADER', 'MEMBER');
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'RETIRED', 'SUSPENDED');
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "RsvpStatus" AS ENUM ('COMING', 'CANT_ATTEND');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "locals" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "locals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower("email"))
);

CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "classification" VARCHAR(100) NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "body" TEXT NOT NULL,
    "push_preview" VARCHAR(120),
    "needs_ack" BOOLEAN NOT NULL DEFAULT false,
    "classification_filter" VARCHAR(100),
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "announcements_push_preview_length_check" CHECK (char_length("push_preview") <= 120)
);

CREATE TABLE "announcement_recipients" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "read_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "rsvp_status" "RsvpStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_outbox_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE TABLE "notification_dispatches" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "dispatched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_local_id_role_idx" ON "users"("local_id", "role");
CREATE UNIQUE INDEX "users_local_id_id_key" ON "users"("local_id", "id");

CREATE UNIQUE INDEX "members_user_id_key" ON "members"("user_id");
CREATE INDEX "members_local_id_status_classification_idx" ON "members"("local_id", "status", "classification");
CREATE INDEX "members_local_id_classification_status_idx" ON "members"("local_id", "classification", "status");
CREATE UNIQUE INDEX "members_local_id_id_key" ON "members"("local_id", "id");
CREATE UNIQUE INDEX "members_local_id_email_key" ON "members"("local_id", "email");
CREATE UNIQUE INDEX "members_local_id_user_id_key" ON "members"("local_id", "user_id");

CREATE INDEX "announcements_local_id_status_created_at_idx" ON "announcements"("local_id", "status", "created_at");
CREATE INDEX "announcements_local_id_created_at_idx" ON "announcements"("local_id", "created_at");
CREATE UNIQUE INDEX "announcements_local_id_id_key" ON "announcements"("local_id", "id");

CREATE INDEX "announcement_recipients_local_id_member_id_created_at_idx" ON "announcement_recipients"("local_id", "member_id", "created_at");
CREATE INDEX "announcement_recipients_announcement_id_delivery_status_idx" ON "announcement_recipients"("announcement_id", "delivery_status");
CREATE INDEX "announcement_recipients_announcement_id_read_at_idx" ON "announcement_recipients"("announcement_id", "read_at");
CREATE INDEX "announcement_recipients_announcement_id_acknowledged_at_idx" ON "announcement_recipients"("announcement_id", "acknowledged_at");
CREATE UNIQUE INDEX "announcement_recipients_local_id_id_key" ON "announcement_recipients"("local_id", "id");
CREATE UNIQUE INDEX "announcement_recipients_announcement_id_member_id_key" ON "announcement_recipients"("announcement_id", "member_id");

CREATE UNIQUE INDEX "notification_outbox_recipient_id_key" ON "notification_outbox"("recipient_id");
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox"("status", "next_attempt_at");
CREATE INDEX "notification_outbox_local_id_status_idx" ON "notification_outbox"("local_id", "status");
CREATE UNIQUE INDEX "notification_outbox_local_id_recipient_id_key" ON "notification_outbox"("local_id", "recipient_id");

CREATE UNIQUE INDEX "notification_dispatches_recipient_id_key" ON "notification_dispatches"("recipient_id");
CREATE INDEX "notification_dispatches_local_id_dispatched_at_idx" ON "notification_dispatches"("local_id", "dispatched_at");
CREATE UNIQUE INDEX "notification_dispatches_local_id_recipient_id_key" ON "notification_dispatches"("local_id", "recipient_id");

CREATE INDEX "audit_logs_local_id_created_at_idx" ON "audit_logs"("local_id", "created_at");
CREATE INDEX "audit_logs_local_id_action_created_at_idx" ON "audit_logs"("local_id", "action", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_local_id_user_id_fkey" FOREIGN KEY ("local_id", "user_id") REFERENCES "users"("local_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_local_id_created_by_id_fkey" FOREIGN KEY ("local_id", "created_by_id") REFERENCES "users"("local_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_local_id_approved_by_id_fkey" FOREIGN KEY ("local_id", "approved_by_id") REFERENCES "users"("local_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_local_id_announcement_id_fkey" FOREIGN KEY ("local_id", "announcement_id") REFERENCES "announcements"("local_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_local_id_member_id_fkey" FOREIGN KEY ("local_id", "member_id") REFERENCES "members"("local_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_local_id_recipient_id_fkey" FOREIGN KEY ("local_id", "recipient_id") REFERENCES "announcement_recipients"("local_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_local_id_recipient_id_fkey" FOREIGN KEY ("local_id", "recipient_id") REFERENCES "announcement_recipients"("local_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_local_id_actor_id_fkey" FOREIGN KEY ("local_id", "actor_id") REFERENCES "users"("local_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
