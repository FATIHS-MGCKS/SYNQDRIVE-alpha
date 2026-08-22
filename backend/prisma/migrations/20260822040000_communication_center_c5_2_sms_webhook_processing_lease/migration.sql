-- C5.2: bounded webhook processing lease (processingClaimedAt).
-- C5.1 stored only processingError=in_progress with no expiry, risking permanent deadlock
-- after worker crash. This column records local claim time for stale-owner reclaim.

ALTER TABLE "sms_webhook_events"
  ADD COLUMN IF NOT EXISTS "processing_claimed_at" TIMESTAMP(3);
