-- Must run in its own migration: PostgreSQL cannot use a new enum value
-- in the same transaction where it was added (55P04).
ALTER TYPE "CustomerRiskLevel" ADD VALUE IF NOT EXISTS 'NOT_ASSESSED' BEFORE 'LOW';
