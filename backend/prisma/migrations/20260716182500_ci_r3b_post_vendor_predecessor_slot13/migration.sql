-- CI-R3B historical predecessor repair slot 13
-- after: 20260716180000_tire_evidence_ground_truth_provenance
-- before: 20260716183000_tire_lifecycle_invariants

DO $$ BEGIN
    CREATE TYPE "TireSetupStatus" AS ENUM ('ACTIVE', 'STORED', 'DISCARDED', 'SOLD');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
