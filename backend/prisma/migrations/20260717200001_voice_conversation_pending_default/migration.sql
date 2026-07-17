-- Apply PENDING default after enum value is committed (PostgreSQL 55P04 guard).
ALTER TABLE "voice_conversations"
  ALTER COLUMN "outcome" SET DEFAULT 'PENDING';
