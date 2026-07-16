-- Driving Intelligence V2 P23 — additive DrivingEventType values for DIMO native mapper.
ALTER TYPE "DrivingEventType" ADD VALUE IF NOT EXISTS 'UNMAPPED_PROVIDER_EVENT';
ALTER TYPE "DrivingEventType" ADD VALUE IF NOT EXISTS 'SAFETY_COLLISION';
