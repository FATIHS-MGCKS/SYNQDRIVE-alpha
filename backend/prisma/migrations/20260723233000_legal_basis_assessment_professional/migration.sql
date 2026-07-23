-- LegalBasisAssessment professional model (Prompt 7)

-- CreateEnum
CREATE TYPE "LegalBasisConsentRequirement" AS ENUM (
  'NOT_APPLICABLE',
  'EXPLICIT_OPT_IN',
  'GRANULAR_PER_PURPOSE',
  'WRITTEN_CONSENT',
  'ELECTRONIC_CONSENT_WITH_AUDIT'
);

-- PrivacyLegalBasisType: align with Art. 6 GDPR taxonomy
ALTER TYPE "PrivacyLegalBasisType" RENAME VALUE 'LEGITIMATE_INTEREST' TO 'LEGITIMATE_INTERESTS';
ALTER TYPE "PrivacyLegalBasisType" RENAME VALUE 'VITAL_INTEREST' TO 'VITAL_INTERESTS';
ALTER TYPE "PrivacyLegalBasisType" RENAME VALUE 'PUBLIC_INTEREST' TO 'PUBLIC_TASK';
ALTER TYPE "PrivacyLegalBasisType" ADD VALUE IF NOT EXISTS 'OTHER_WITH_LEGAL_REFERENCE';

-- LegalBasisAssessmentStatus: four-eyes lifecycle
ALTER TYPE "LegalBasisAssessmentStatus" RENAME VALUE 'CONFIRMED' TO 'APPROVED';
ALTER TYPE "LegalBasisAssessmentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "LegalBasisAssessmentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- AlterTable legal_basis_assessments
ALTER TABLE "legal_basis_assessments"
  ADD COLUMN IF NOT EXISTS "policy_family_id" UUID,
  ADD COLUMN IF NOT EXISTS "version_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_current_version" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "legal_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "necessity_assessment" TEXT,
  ADD COLUMN IF NOT EXISTS "proportionality_assessment" TEXT,
  ADD COLUMN IF NOT EXISTS "legitimate_interest_description" TEXT,
  ADD COLUMN IF NOT EXISTS "balancing_test_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_requirement" "LegalBasisConsentRequirement" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "review_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

-- Backfill policy_family_id for any existing rows
UPDATE "legal_basis_assessments"
SET "policy_family_id" = "id"
WHERE "policy_family_id" IS NULL;

ALTER TABLE "legal_basis_assessments"
  ALTER COLUMN "policy_family_id" SET NOT NULL;

ALTER TABLE "legal_basis_assessments"
  DROP COLUMN IF EXISTS "rationale_summary";

-- CreateTable evidence refs
CREATE TABLE IF NOT EXISTS "legal_basis_assessment_evidence_refs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "legal_basis_assessment_id" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "label" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_basis_assessment_evidence_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "legal_basis_assessments_policy_family_id_version_number_key"
  ON "legal_basis_assessments"("policy_family_id", "version_number");

CREATE INDEX IF NOT EXISTS "legal_basis_assessments_policy_family_id_is_current_version_idx"
  ON "legal_basis_assessments"("policy_family_id", "is_current_version");

CREATE UNIQUE INDEX IF NOT EXISTS "legal_basis_assessment_evidence_refs_legal_basis_assessment_id_reference_key"
  ON "legal_basis_assessment_evidence_refs"("legal_basis_assessment_id", "reference");

CREATE INDEX IF NOT EXISTS "legal_basis_assessment_evidence_refs_organization_id_idx"
  ON "legal_basis_assessment_evidence_refs"("organization_id");

-- AddForeignKey
ALTER TABLE "legal_basis_assessment_evidence_refs"
  DROP CONSTRAINT IF EXISTS "legal_basis_assessment_evidence_refs_legal_basis_assessment_id_fkey";

ALTER TABLE "legal_basis_assessment_evidence_refs"
  ADD CONSTRAINT "legal_basis_assessment_evidence_refs_legal_basis_assessment_id_fkey"
  FOREIGN KEY ("legal_basis_assessment_id") REFERENCES "legal_basis_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
