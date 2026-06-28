-- Misuse Case Aggregation: add context-assessment + RPM webhook candidate evidence sources.
-- Additive enum values used by context-derived misuse evidence (LTE_R1/ICE).
ALTER TYPE "MisuseEvidenceSourceType" ADD VALUE IF NOT EXISTS 'EVENT_CONTEXT_ASSESSMENT';
ALTER TYPE "MisuseEvidenceSourceType" ADD VALUE IF NOT EXISTS 'RPM_WEBHOOK_CANDIDATE';
