-- Add non-terminal conversation outcome for in-flight calls.
-- PostgreSQL requires new enum values to be committed before use (see follow-up migration).
ALTER TYPE "VoiceConversationOutcome" ADD VALUE IF NOT EXISTS 'PENDING';
