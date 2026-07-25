-- Add structured payload for fleet chat assistant messages (sources, freshness, warnings).
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "structured_payload" JSONB;
