-- Add an explicit RSVP capability to the approved announcement snapshot.
ALTER TABLE "announcements"
ADD COLUMN "rsvp_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the meaning of legacy Phase 2 RSVP fixtures when upgrading an existing database.
UPDATE "announcements" a
SET "rsvp_enabled" = true
WHERE EXISTS (
  SELECT 1 FROM "announcement_recipients" r
  WHERE r."announcement_id" = a."id" AND r."rsvp_status" IS NOT NULL
);

CREATE TYPE "RsvpResponse" AS ENUM ('YES', 'NO', 'MAYBE');

ALTER TABLE "announcement_recipients"
ADD COLUMN "rsvp_updated_at" TIMESTAMP(3);

ALTER TABLE "announcement_recipients"
ALTER COLUMN "rsvp_status" TYPE "RsvpResponse"
USING (
  CASE "rsvp_status"::text
    WHEN 'COMING' THEN 'YES'
    WHEN 'CANT_ATTEND' THEN 'NO'
    ELSE NULL
  END
)::"RsvpResponse";

UPDATE "announcement_recipients"
SET "rsvp_updated_at" = COALESCE("updated_at", "created_at")
WHERE "rsvp_status" IS NOT NULL;

ALTER TABLE "announcement_recipients"
ADD CONSTRAINT "announcement_recipients_rsvp_timestamp_check"
CHECK (("rsvp_status" IS NULL) = ("rsvp_updated_at" IS NULL));

DROP TYPE "RsvpStatus";

CREATE INDEX "announcement_recipients_local_id_member_id_created_at_id_idx"
ON "announcement_recipients"("local_id", "member_id", "created_at" DESC, "id" DESC);

CREATE INDEX "announcement_recipients_announcement_id_rsvp_status_idx"
ON "announcement_recipients"("announcement_id", "rsvp_status");
