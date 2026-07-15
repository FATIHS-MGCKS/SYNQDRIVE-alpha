-- Prompt 29: SaaS billing notification emails via Resend outbox consumer
ALTER TYPE "OutboundEmailSourceType" ADD VALUE IF NOT EXISTS 'BILLING_EMAIL';
