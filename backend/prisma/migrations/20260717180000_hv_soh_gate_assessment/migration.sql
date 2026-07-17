-- Prompt 57/78: internal HV SOH gate assessment type (no customer publication).

ALTER TYPE "BatteryAssessmentType" ADD VALUE IF NOT EXISTS 'HV_SOH_CAPACITY_ESTIMATE';
