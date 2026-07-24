-- Prompt 33: Compliance evidence and auditable reports for internal privacy/ISO audits

CREATE TYPE "ComplianceEvidenceReportType" AS ENUM (
  'FULL_PACKAGE',
  'PROCESSING_ACTIVITY_VERSION',
  'LEGAL_BASIS',
  'CONSENT',
  'PROVIDER_ACCESS_GRANT',
  'DATA_PROCESSING_AGREEMENT',
  'DPIA',
  'ENFORCEMENT_COVERAGE',
  'REVIEW_APPROVAL',
  'POLICY_DEPLOYMENT',
  'REVOCATION',
  'RETENTION',
  'DELETION',
  'AUTHORIZATION_DECISIONS',
  'RUNTIME_HEALTH',
  'PROVIDER_CONSISTENCY'
);

CREATE TYPE "ComplianceEvidenceReportStatus" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "ComplianceEvidenceReportFormat" AS ENUM (
  'JSON'
);

CREATE TYPE "ComplianceEvidenceAuditAction" AS ENUM (
  'EXPORT_REQUESTED',
  'EXPORT_COMPLETED',
  'EXPORT_FAILED',
  'EXPORT_DOWNLOADED'
);

CREATE TABLE "compliance_evidence_reports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_type" "ComplianceEvidenceReportType" NOT NULL,
  "format" "ComplianceEvidenceReportFormat" NOT NULL DEFAULT 'JSON',
  "status" "ComplianceEvidenceReportStatus" NOT NULL DEFAULT 'PLANNED',
  "idempotency_key" TEXT NOT NULL,
  "period_from" TIMESTAMP(3),
  "period_to" TIMESTAMP(3),
  "generated_at" TIMESTAMP(3),
  "generated_by_user_id" TEXT,
  "record_version" TEXT NOT NULL,
  "git_commit" TEXT,
  "build_version" TEXT,
  "includes_runtime_data" BOOLEAN NOT NULL DEFAULT false,
  "compliance_claim_allowed" BOOLEAN NOT NULL DEFAULT false,
  "gap_count" INTEGER NOT NULL DEFAULT 0,
  "section_summary" JSONB,
  "file_name" TEXT,
  "file_path" TEXT,
  "mime_type" TEXT,
  "checksum_sha256" TEXT,
  "data_snapshot_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_evidence_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compliance_evidence_report_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "action" "ComplianceEvidenceAuditAction" NOT NULL,
  "actor_user_id" TEXT,
  "report_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compliance_evidence_report_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_evidence_reports_idempotency_key_key"
  ON "compliance_evidence_reports"("idempotency_key");
CREATE INDEX "compliance_evidence_reports_organization_id_created_at_idx"
  ON "compliance_evidence_reports"("organization_id", "created_at");
CREATE INDEX "compliance_evidence_reports_organization_id_status_idx"
  ON "compliance_evidence_reports"("organization_id", "status");
CREATE INDEX "compliance_evidence_reports_organization_id_expires_at_idx"
  ON "compliance_evidence_reports"("organization_id", "expires_at");

CREATE INDEX "compliance_evidence_report_audit_events_organization_id_created_at_idx"
  ON "compliance_evidence_report_audit_events"("organization_id", "created_at");
CREATE INDEX "compliance_evidence_report_audit_events_organization_id_action_idx"
  ON "compliance_evidence_report_audit_events"("organization_id", "action");

ALTER TABLE "compliance_evidence_reports"
  ADD CONSTRAINT "compliance_evidence_reports_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "compliance_evidence_report_audit_events"
  ADD CONSTRAINT "compliance_evidence_report_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
