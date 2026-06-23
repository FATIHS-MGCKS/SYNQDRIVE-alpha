-- Manual billing exclusion flag per vehicle
ALTER TABLE "vehicles" ADD COLUMN "billing_excluded" BOOLEAN NOT NULL DEFAULT false;
