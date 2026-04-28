-- Extend InsightType enum with BATTERY_CRITICAL.
--
-- Background: SynqDrive fleet-ops requested that critical 12V-battery states
-- (voltage < 12.4V or SOH < 75%) surface as a dashboard business insight so
-- operators see starting-problem risk on the org dashboard, not only on the
-- per-vehicle Health Tab. A dedicated insight type lets the ranking and
-- grouping layer treat battery events as their own category and keeps the
-- InsightType enum consistent with the new detector (BatteryCriticalDetector)
-- registered in BusinessInsightsModule.
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'BATTERY_CRITICAL';
