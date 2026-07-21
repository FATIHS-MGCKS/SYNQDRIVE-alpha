-- CreateEnum
CREATE TYPE "AccessReviewCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE');
CREATE TYPE "AccessReviewCampaignScope" AS ENUM ('PRIVILEGED_ACCOUNTS', 'SINGLE_ADMIN', 'INACTIVE_USERS', 'INVALID_ROLE_MEMBERSHIP', 'OVERDUE_REVIEWS');
CREATE TYPE "AccessReviewItemStatus" AS ENUM ('PENDING', 'DECIDED', 'SKIPPED');
CREATE TYPE "AccessReviewDecisionType" AS ENUM ('CONFIRM', 'MODIFY', 'SUSPEND', 'REMOVE', 'ESCALATE');
CREATE TYPE "AccessReviewResultApplicationStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED', 'SKIPPED', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "access_review_campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope" "AccessReviewCampaignScope" NOT NULL,
    "reviewer_user_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "AccessReviewCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_review_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_review_items" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AccessReviewItemStatus" NOT NULL DEFAULT 'PENDING',
    "membership_status" TEXT NOT NULL,
    "membership_version" INTEGER NOT NULL,
    "effective_role" TEXT NOT NULL,
    "effective_role_id" TEXT,
    "effective_role_label" TEXT,
    "privileged_capabilities" JSONB NOT NULL,
    "station_scope" TEXT,
    "station_ids" JSONB,
    "permissions_snapshot" JSONB,
    "last_activity_at" TIMESTAMP(3),
    "mfa_enrolled" BOOLEAN NOT NULL DEFAULT false,
    "active_session_count" INTEGER NOT NULL DEFAULT 0,
    "risk_reasons" JSONB NOT NULL,
    "access_snapshot" JSONB NOT NULL,
    "snapshot_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_review_decisions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reviewer_user_id" TEXT NOT NULL,
    "decision" "AccessReviewDecisionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "result_application_status" "AccessReviewResultApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMP(3),
    "application_error" TEXT,
    "modify_payload" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "membership_version_at_decision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_review_campaigns_organization_id_status_idx" ON "access_review_campaigns"("organization_id", "status");
CREATE INDEX "access_review_campaigns_organization_id_due_at_idx" ON "access_review_campaigns"("organization_id", "due_at");
CREATE INDEX "access_review_items_organization_id_campaign_id_idx" ON "access_review_items"("organization_id", "campaign_id");
CREATE INDEX "access_review_items_campaign_id_status_idx" ON "access_review_items"("campaign_id", "status");
CREATE UNIQUE INDEX "access_review_items_campaign_id_membership_id_key" ON "access_review_items"("campaign_id", "membership_id");
CREATE INDEX "access_review_decisions_campaign_id_idx" ON "access_review_decisions"("campaign_id");
CREATE INDEX "access_review_decisions_organization_id_idx" ON "access_review_decisions"("organization_id");
CREATE INDEX "access_review_decisions_item_id_idx" ON "access_review_decisions"("item_id");
CREATE UNIQUE INDEX "access_review_decisions_idempotency_key_key" ON "access_review_decisions"("idempotency_key");

-- AddForeignKey
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "access_review_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_review_decisions" ADD CONSTRAINT "access_review_decisions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "access_review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_decisions" ADD CONSTRAINT "access_review_decisions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "access_review_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_decisions" ADD CONSTRAINT "access_review_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_review_decisions" ADD CONSTRAINT "access_review_decisions_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
