-- CI-R3B historical predecessor repair: vehicle_tire_setups.status
-- after: 20260716182500_ci_r3b_post_vendor_predecessor_slot13
-- before: 20260716183000_tire_lifecycle_invariants

ALTER TABLE "vehicle_tire_setups" ADD COLUMN "status" "TireSetupStatus" NOT NULL DEFAULT 'ACTIVE'::"TireSetupStatus";
