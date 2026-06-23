-- AlterTable
ALTER TABLE "voice_assistants" ADD COLUMN IF NOT EXISTS "tool_permissions" JSONB;
