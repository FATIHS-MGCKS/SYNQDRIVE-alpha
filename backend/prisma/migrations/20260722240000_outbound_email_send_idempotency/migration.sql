-- Prompt 21/32 — durable idempotency for booking document email sends.

ALTER TABLE "outbound_emails" ADD COLUMN "send_idempotency_key" TEXT;

CREATE UNIQUE INDEX "outbound_emails_org_send_idempotency_key"
    ON "outbound_emails"("organization_id", "send_idempotency_key")
    WHERE "send_idempotency_key" IS NOT NULL;
