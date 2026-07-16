-- Tire odometer anchor backfill audit event type (Prompt 8)
ALTER TYPE "TireEventType" ADD VALUE IF NOT EXISTS 'ODOMETER_ANCHOR_BACKFILLED';
