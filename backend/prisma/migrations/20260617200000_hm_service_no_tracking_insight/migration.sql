-- Add HM_SERVICE_NO_TRACKING insight type for neutral no-tracking info signals
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'HM_SERVICE_NO_TRACKING';
