-- V4.9.17 — Operational rental-blocking flag on org tasks (default false).
ALTER TABLE "org_tasks" ADD COLUMN IF NOT EXISTS "blocks_vehicle_availability" BOOLEAN NOT NULL DEFAULT false;
