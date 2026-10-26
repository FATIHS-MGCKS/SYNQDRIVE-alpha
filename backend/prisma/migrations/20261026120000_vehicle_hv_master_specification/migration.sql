-- Master Admin HV traction stammdaten (separate from SOH reference capacity).
ALTER TABLE "vehicles" ADD COLUMN "hv_master_specification" JSONB;
