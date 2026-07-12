-- V4.9.392 — Führerschein-Ausstellungsdatum on Customer (manual + Didit sync)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "license_issued_at" TIMESTAMP(3);
