-- Add IN_REVIEW to voice phone regulatory status and structured regulatory details JSON.
ALTER TYPE "VoicePhoneRegulatoryStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW' AFTER 'PENDING';

ALTER TABLE "voice_phone_numbers"
  ADD COLUMN IF NOT EXISTS "regulatory_details" JSONB;
