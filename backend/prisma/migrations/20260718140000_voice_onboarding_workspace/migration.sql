-- Server-persisted voice onboarding progress (org workspace IA).
ALTER TABLE "voice_assistants"
  ADD COLUMN IF NOT EXISTS "onboarding_step" TEXT,
  ADD COLUMN IF NOT EXISTS "onboarding_completed_steps" JSONB NOT NULL DEFAULT '[]'::jsonb;
