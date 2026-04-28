-- V4.6.65 — Customer KYC document URLs (additive)
-- Enables real front/back upload for Personalausweis + Führerschein during
-- Customer registration. URLs point at files served under /uploads/.

ALTER TABLE "customers"
  ADD COLUMN "id_front_url"       TEXT,
  ADD COLUMN "id_back_url"        TEXT,
  ADD COLUMN "license_front_url"  TEXT,
  ADD COLUMN "license_back_url"   TEXT;
