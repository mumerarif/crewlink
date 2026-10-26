-- Phase 4 adds the explicit human-review boundary to the announcement lifecycle.
ALTER TYPE "AnnouncementStatus" ADD VALUE 'PENDING_APPROVAL' AFTER 'DRAFT';
