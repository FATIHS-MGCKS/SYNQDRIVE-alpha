-- Prompt 5A: immutable deployment config snapshots + superseded lineage
ALTER TYPE "VoiceAgentDeploymentStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE "voice_agent_deployments"
  ADD COLUMN IF NOT EXISTS "config_snapshot" JSONB;
