-- Prompt 34/78: MISSING_CONTEXT quality for LV rest measurements without assessable context.
ALTER TYPE "BatteryMeasurementQuality" ADD VALUE IF NOT EXISTS 'MISSING_CONTEXT';
