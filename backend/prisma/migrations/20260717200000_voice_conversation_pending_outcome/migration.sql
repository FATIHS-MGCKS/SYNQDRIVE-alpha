-- Add non-terminal conversation outcome for in-flight calls.
ALTER TYPE "VoiceConversationOutcome" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TABLE "voice_conversations"
  ALTER COLUMN "outcome" SET DEFAULT 'PENDING';
