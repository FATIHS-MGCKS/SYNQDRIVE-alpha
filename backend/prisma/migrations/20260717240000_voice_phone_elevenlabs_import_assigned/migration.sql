-- ElevenLabs import assignment status and protected ElevenLabs phone refs.
ALTER TYPE "VoiceElevenLabsImportStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED' AFTER 'IMPORTED';

ALTER TABLE "voice_phone_numbers"
  ADD COLUMN IF NOT EXISTS "protected_elevenlabs_ref" TEXT,
  ADD COLUMN IF NOT EXISTS "elevenlabs_ref_digest" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "voice_phone_numbers_elevenlabs_ref_digest_key"
  ON "voice_phone_numbers" ("elevenlabs_ref_digest")
  WHERE "elevenlabs_ref_digest" IS NOT NULL;
