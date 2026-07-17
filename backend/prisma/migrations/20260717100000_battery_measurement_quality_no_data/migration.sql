-- Prompt 38/78: NO_DATA quality for start-proxy cadence gate
ALTER TYPE "BatteryMeasurementQuality" ADD VALUE IF NOT EXISTS 'NO_DATA';
