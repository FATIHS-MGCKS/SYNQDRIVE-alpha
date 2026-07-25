-- Restores the legal-basis link on data_subject_consents.
--
-- `20260723234500_consent_provider_sharing_domains` dropped the legacy
-- `legal_basis_assessment_id` column while reshaping the table. The consent
-- domain (and its Postgres integration harness) still records which legal basis
-- assessment a consent was captured under, so the Prisma model carries the
-- field again — without this column every `dataSubjectConsent` query fails with
-- "column data_subject_consents.legalBasisAssessmentId does not exist".

ALTER TABLE "data_subject_consents"
  ADD COLUMN IF NOT EXISTS "legal_basis_assessment_id" TEXT;

CREATE INDEX IF NOT EXISTS "data_subject_consents_legal_basis_assessment_id_idx"
  ON "data_subject_consents"("legal_basis_assessment_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_subject_consents_legal_basis_assessment_id_fkey'
  ) THEN
    ALTER TABLE "data_subject_consents"
      ADD CONSTRAINT "data_subject_consents_legal_basis_assessment_id_fkey"
      FOREIGN KEY ("legal_basis_assessment_id")
      REFERENCES "legal_basis_assessments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
