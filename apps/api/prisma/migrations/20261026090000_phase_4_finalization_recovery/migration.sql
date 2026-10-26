-- Support bounded polling of stale announcements that may need post-delivery finalization.
CREATE INDEX "announcements_status_updated_at_id_idx"
ON "announcements"("status", "updated_at", "id");
