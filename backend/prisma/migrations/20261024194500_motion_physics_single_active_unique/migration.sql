-- One active motion-physics reference row per org/vehicle (append-only history via supersede).
CREATE UNIQUE INDEX "vehicle_motion_physics_references_one_active_per_vehicle_uidx"
ON "vehicle_motion_physics_references" ("organization_id", "vehicle_id")
WHERE "is_active" = true AND "superseded_by_id" IS NULL;
