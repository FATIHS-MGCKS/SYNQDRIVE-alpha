-- P3B0: canonical persisted platform permission grants (master-billing only)

CREATE TYPE "PlatformPermissionKey" AS ENUM ('master-billing');

CREATE TABLE "user_platform_permission_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_key" "PlatformPermissionKey" NOT NULL,
    "granted_by_user_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_platform_permission_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_platform_permission_grants_user_id_permission_key_revoked_at_idx" ON "user_platform_permission_grants"("user_id", "permission_key", "revoked_at");

CREATE UNIQUE INDEX "user_platform_permission_grants_active_unique" ON "user_platform_permission_grants" ("user_id", "permission_key") WHERE "revoked_at" IS NULL;

ALTER TABLE "user_platform_permission_grants" ADD CONSTRAINT "user_platform_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_platform_permission_grants" ADD CONSTRAINT "user_platform_permission_grants_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_platform_permission_grants" ADD CONSTRAINT "user_platform_permission_grants_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;