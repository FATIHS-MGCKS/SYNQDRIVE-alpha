/**
 * Smoke-test Mistral connectivity using backend/.env (never commit secrets).
 * Usage: npx ts-node scripts/probe-mistral-ai.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { Mistral } from '@mistralai/mistralai';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));

async function main() {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  const baseUrl = process.env.MISTRAL_BASE_URL?.trim();
  const model =
    process.env.MISTRAL_JSON_MODEL?.trim() ||
    process.env.MISTRAL_CHAT_MODEL?.trim() ||
    'mistral-small-latest';

  if (!apiKey) {
    console.error('FAIL: MISTRAL_API_KEY is missing in backend/.env');
    process.exit(1);
  }

  const client = new Mistral({
    apiKey,
    ...(baseUrl ? { serverURL: baseUrl } : {}),
  });

  const started = Date.now();
  const response = await client.chat.complete({
    model,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    maxTokens: 8,
    temperature: 0,
  });

  const content = response.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content);

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: process.env.AI_PROVIDER || 'mistral',
        model: response.model ?? model,
        latencyMs: Date.now() - started,
        replyPreview: String(text).slice(0, 80),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
