-- P2 auto projection outbox: bounded claim lease + token fencing for PROCESSING recovery.

ALTER TABLE di_v0_trip_speed_quality_auto_projection_outbox_v1
  ADD COLUMN claim_token TEXT NULL,
  ADD COLUMN claim_expires_at TIMESTAMPTZ NULL;

CREATE INDEX di_v0_p2_auto_outbox_processing_lease_idx
  ON di_v0_trip_speed_quality_auto_projection_outbox_v1 (status, claim_expires_at)
  WHERE status = 'PROCESSING';
