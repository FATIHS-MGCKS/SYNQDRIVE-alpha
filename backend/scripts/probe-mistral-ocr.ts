/**
 * Optional paid Mistral OCR smoke test — skipped unless explicitly enabled.
 *
 * Usage:
 *   MISTRAL_OCR_SMOKE=1 npx ts-node scripts/probe-mistral-ocr.ts
 *
 * Requires MISTRAL_API_KEY in backend/.env (never commit secrets).
 * Uses a tiny synthetic PNG (no customer data).
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

/** 1x1 white PNG — minimal non-sensitive probe payload. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  if (process.env.MISTRAL_OCR_SMOKE !== '1') {
    console.log('SKIP: set MISTRAL_OCR_SMOKE=1 to run paid OCR smoke test');
    process.exit(0);
  }

  loadEnvFile(path.join(__dirname, '..', '.env'));

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  const model = process.env.MISTRAL_OCR_MODEL?.trim() || 'mistral-ocr-latest';
  const baseUrl = process.env.MISTRAL_BASE_URL?.trim();

  if (!apiKey) {
    console.error('FAIL: MISTRAL_API_KEY is missing in backend/.env');
    process.exit(1);
  }

  const client = new Mistral({
    apiKey,
    ...(baseUrl ? { serverURL: baseUrl } : {}),
  });

  const started = Date.now();
  const response = await client.ocr.process({
    model,
    document: {
      type: 'image_url',
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
    },
    includeImageBase64: false,
  });

  const pageCount = response.pages?.length ?? 0;
  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: 'mistral',
        model: response.model ?? model,
        pageCount,
        latencyMs: Date.now() - started,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('FAIL:', message.replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]'));
  process.exit(1);
});
