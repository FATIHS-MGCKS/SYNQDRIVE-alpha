import twilio = require('twilio');

export function validateTwilioWebhookSignature(params: {
  authToken: string;
  signature: string | undefined;
  url: string;
  body: Record<string, string>;
}): boolean {
  const { authToken, signature, url, body } = params;
  if (!authToken?.trim() || !signature?.trim()) {
    return false;
  }
  return twilio.validateRequest(authToken, signature, url, body);
}

export function parseTwilioFormBody(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

export function buildTwilioWebhookUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
