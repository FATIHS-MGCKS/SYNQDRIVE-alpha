-- ERD E5.1a — enum value only (must commit before use in CHECK constraints).
ALTER TYPE "VehicleEnergyEventDetectionSource" ADD VALUE IF NOT EXISTS 'SYNQDRIVE_ERD_RECHARGE_PROJECTION';
