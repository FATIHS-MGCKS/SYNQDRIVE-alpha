-- Service event provenance (origin + audit user ids)
CREATE TYPE "ServiceEventOrigin" AS ENUM ('MANUAL', 'AI_UPLOAD', 'WORKSHOP_DOCUMENT', 'IMPORT', 'OEM');

ALTER TABLE "vehicle_service_events"
  ADD COLUMN "origin" "ServiceEventOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "created_by_id" TEXT,
  ADD COLUMN "updated_by_id" TEXT;
