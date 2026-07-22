-- Prompt 11/22: Role change application idempotency log

CREATE TABLE "organization_role_change_applications" (
  "id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "organization_role_id" TEXT NOT NULL,
  "preview_hash" TEXT NOT NULL,
  "expected_version_number" INTEGER NOT NULL,
  "actor_user_id" TEXT,
  "reason" TEXT,
  "created_role_version_id" TEXT,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organization_role_change_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_role_change_applications_idempotency_key_key"
  ON "organization_role_change_applications"("idempotency_key");
CREATE INDEX "organization_role_change_applications_organization_id_organization_role_id_created_at_idx"
  ON "organization_role_change_applications"("organization_id", "organization_role_id", "created_at");

ALTER TABLE "organization_role_change_applications"
  ADD CONSTRAINT "organization_role_change_applications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_change_applications"
  ADD CONSTRAINT "organization_role_change_applications_organization_role_id_fkey"
  FOREIGN KEY ("organization_role_id") REFERENCES "organization_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_change_applications"
  ADD CONSTRAINT "organization_role_change_applications_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_role_change_applications"
  ADD CONSTRAINT "organization_role_change_applications_created_role_version_id_fkey"
  FOREIGN KEY ("created_role_version_id") REFERENCES "organization_role_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
