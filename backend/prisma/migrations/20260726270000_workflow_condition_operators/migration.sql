-- Extend workflow condition operators for Phase 6 Prompt 27
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'NOT_EXISTS';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'ENDS_WITH';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'CHANGED_FROM';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'CHANGED_TO';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'DURATION_EXCEEDED';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'WITHIN_TIME_WINDOW';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'BEFORE';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'AFTER';
ALTER TYPE "WorkflowConditionOperator" ADD VALUE IF NOT EXISTS 'BETWEEN';
