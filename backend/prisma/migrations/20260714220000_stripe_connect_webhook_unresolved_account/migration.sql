-- Add UNRESOLVED_ACCOUNT for Connect webhooks from unknown connected accounts
ALTER TYPE "StripeConnectWebhookProcessingStatus" ADD VALUE 'UNRESOLVED_ACCOUNT';
