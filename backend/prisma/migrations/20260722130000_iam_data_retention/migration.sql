-- CreateEnum
CREATE TYPE "IamDataCategory" AS ENUM ('GLOBAL_USER_PROFILE', 'MEMBERSHIP', 'SESSION_REFRESH_TOKEN', 'IP_USER_AGENT', 'LOGIN_FAILURE', 'INVITE', 'RESET_TOKEN', 'MFA_DATA', 'AUDIT_LOG', 'ACCESS_REVIEW', 'SECURITY_EVENT');
CREATE TYPE "IamRetentionStrategy" AS ENUM ('DELETE', 'ANONYMIZE', 'PSEUDONYMIZE', 'NO_OP');

-- CreateTable
CREATE TABLE "iam_retention_policy_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" "IamDataCategory" NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "strategy" "IamRetentionStrategy" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_retention_policy_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_legal_holds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "category" "IamDataCategory",
    "reason" TEXT NOT NULL,
    "placed_by_user_id" TEXT NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "released_by_user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_retention_run_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "category" "IamDataCategory" NOT NULL,
    "trigger" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "affected" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_retention_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_dsar_export_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subject_user_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "export_format" TEXT NOT NULL DEFAULT 'json',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "record_count" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_dsar_export_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iam_retention_policy_overrides_organization_id_category_key" ON "iam_retention_policy_overrides"("organization_id", "category");
CREATE INDEX "iam_retention_policy_overrides_organization_id_enabled_idx" ON "iam_retention_policy_overrides"("organization_id", "enabled");
CREATE INDEX "iam_legal_holds_organization_id_user_id_idx" ON "iam_legal_holds"("organization_id", "user_id");
CREATE INDEX "iam_legal_holds_user_id_released_at_idx" ON "iam_legal_holds"("user_id", "released_at");
CREATE INDEX "iam_retention_run_logs_organization_id_category_created_at_idx" ON "iam_retention_run_logs"("organization_id", "category", "created_at");
CREATE UNIQUE INDEX "iam_dsar_export_logs_idempotency_key_key" ON "iam_dsar_export_logs"("idempotency_key");
CREATE INDEX "iam_dsar_export_logs_organization_id_subject_user_id_idx" ON "iam_dsar_export_logs"("organization_id", "subject_user_id");

-- AddForeignKey
ALTER TABLE "iam_retention_policy_overrides" ADD CONSTRAINT "iam_retention_policy_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iam_retention_policy_overrides" ADD CONSTRAINT "iam_retention_policy_overrides_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "iam_legal_holds" ADD CONSTRAINT "iam_legal_holds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iam_legal_holds" ADD CONSTRAINT "iam_legal_holds_placed_by_user_id_fkey" FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iam_retention_run_logs" ADD CONSTRAINT "iam_retention_run_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "iam_dsar_export_logs" ADD CONSTRAINT "iam_dsar_export_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iam_dsar_export_logs" ADD CONSTRAINT "iam_dsar_export_logs_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iam_dsar_export_logs" ADD CONSTRAINT "iam_dsar_export_logs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
