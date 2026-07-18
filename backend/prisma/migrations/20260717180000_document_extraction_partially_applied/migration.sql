-- Document extraction: partial apply outcome when optional actions fail.
ALTER TYPE "DocumentExtractionStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPLIED';
