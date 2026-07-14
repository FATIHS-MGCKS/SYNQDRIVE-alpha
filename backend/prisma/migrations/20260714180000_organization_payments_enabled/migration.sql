-- End-customer payments org feature flag — disabled by default for all existing organizations.
ALTER TABLE "organizations" ADD COLUMN "payments_enabled" BOOLEAN NOT NULL DEFAULT false;
