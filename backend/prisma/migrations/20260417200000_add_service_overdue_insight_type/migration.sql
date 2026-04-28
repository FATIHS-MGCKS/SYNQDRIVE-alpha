-- Extend InsightType enum with SERVICE_OVERDUE.
--
-- Background: SynqDrive fleet-ops requested that overdue manufacturer services
-- surface as a dashboard business insight (critical) so operators see
-- workshop-due risk on the org dashboard, not only on the per-vehicle Health
-- Tab Service Info card. A dedicated insight type lets the ranking and
-- grouping layer treat service overdue events as their own category and
-- keeps the InsightType enum consistent with the new detector
-- (ServiceOverdueDetector) registered in BusinessInsightsModule.
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'SERVICE_OVERDUE';
