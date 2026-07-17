-- Document Intake V2 — additive enum types only (Prompt 15/84).
-- No tables, no columns, no DROP, no ALTER on existing enums.
-- See docs/architecture/document-intake-v2-prisma-plan.md §3.

CREATE TYPE "DocumentCategory" AS ENUM (
  'SERVICE',
  'MAINTENANCE',
  'INSPECTION',
  'FINANCE',
  'DAMAGE',
  'CONDITION',
  'GENERAL'
);

CREATE TYPE "DocumentSubtype" AS ENUM (
  'UNSPECIFIED',
  'STANDARD',
  'CREDIT_NOTE',
  'PAYMENT_REMINDER',
  'PARKING_FINE',
  'SPEEDING_FINE',
  'ROUTINE_MAINTENANCE',
  'INSPECTION_PASS',
  'INSPECTION_FAIL',
  'OTHER'
);

CREATE TYPE "DocumentEntityType" AS ENUM (
  'VEHICLE',
  'BOOKING',
  'CUSTOMER',
  'DRIVER',
  'VENDOR',
  'ORGANIZATION'
);

CREATE TYPE "DocumentCandidateStatus" AS ENUM (
  'PROPOSED',
  'CONFIRMED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "DocumentLinkStatus" AS ENUM (
  'ACTIVE',
  'REVOKED',
  'SUPERSEDED'
);

CREATE TYPE "DocumentActionType" AS ENUM (
  'CREATE_SERVICE_EVENT',
  'UPDATE_VEHICLE_INSPECTION',
  'CREATE_INVOICE',
  'CREATE_FINE',
  'CREATE_DAMAGE',
  'RECORD_TIRE_MEASUREMENT',
  'RECORD_BRAKE_EVIDENCE',
  'RECORD_BATTERY_EVIDENCE',
  'ARCHIVE_ONLY',
  'SUGGEST_TASK'
);

CREATE TYPE "DocumentActionStatus" AS ENUM (
  'WOULD_APPLY',
  'APPLIED',
  'SKIPPED',
  'FAILED',
  'BLOCKED'
);

CREATE TYPE "DocumentActionRequirement" AS ENUM (
  'REQUIRED',
  'OPTIONAL',
  'BLOCKER',
  'INFORMATIONAL'
);

CREATE TYPE "DocumentFollowUpType" AS ENUM (
  'CREATE_TASK',
  'REQUEST_CUSTOMER_INFO',
  'SCHEDULE_INSPECTION',
  'NOTIFY_DRIVER',
  'LINK_TO_BOOKING',
  'MANUAL_REVIEW'
);

CREATE TYPE "DocumentFollowUpStatus" AS ENUM (
  'SUGGESTED',
  'ACCEPTED',
  'DISMISSED',
  'COMPLETED'
);

CREATE TYPE "DocumentProcessingMaturity" AS ENUM (
  'SHADOW',
  'CANDIDATE',
  'PUBLISHED',
  'SUPERSEDED',
  'FAILED'
);

CREATE TYPE "DocumentDuplicateStatus" AS ENUM (
  'UNIQUE',
  'DUPLICATE_WARNING',
  'DUPLICATE_BLOCKED',
  'UNKNOWN'
);

CREATE TYPE "DocumentApplyMode" AS ENUM (
  'DRY_RUN',
  'PREVIEW',
  'APPLY',
  'ARCHIVE_ONLY'
);
