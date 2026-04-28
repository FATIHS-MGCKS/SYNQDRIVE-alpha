-- V4.6.64 — Customer operational fields (additive)
-- Enables persistent end-to-end rental flow: Customer & Booking create.

-- New enums
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE');
CREATE TYPE "CustomerRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- Extend CustomerStatus enum with UI-aligned values
ALTER TYPE "CustomerStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "CustomerStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';

-- Extend customers table with operational fields
ALTER TABLE "customers"
  ADD COLUMN "zip" TEXT,
  ADD COLUMN "company" TEXT,
  ADD COLUMN "customer_type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "risk_level" "CustomerRiskLevel" NOT NULL DEFAULT 'LOW',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "license_expiry" TIMESTAMP(3),
  ADD COLUMN "license_class" TEXT,
  ADD COLUMN "id_type" TEXT,
  ADD COLUMN "id_number" TEXT,
  ADD COLUMN "id_expiry" TIMESTAMP(3),
  ADD COLUMN "id_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "license_verified" BOOLEAN NOT NULL DEFAULT false;
