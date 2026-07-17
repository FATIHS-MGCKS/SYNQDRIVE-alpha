export function isVoiceMcpGatewayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_AI_MCP_GATEWAY_ENABLED === 'true';
}

export function resolveVoiceMcpTokenSecret(env: NodeJS.ProcessEnv = process.env): string {
  const dedicated = env.VOICE_MCP_TOKEN_SECRET?.trim();
  if (dedicated) {
    return dedicated;
  }
  const jwt = env.JWT_SECRET?.trim();
  if (!jwt) {
    throw new Error('VOICE_MCP_TOKEN_SECRET or JWT_SECRET must be configured for voice MCP gateway.');
  }
  return jwt;
}

export function resolveVoiceMcpTokenTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VOICE_MCP_TOKEN_TTL_SECONDS ?? '');
  if (Number.isFinite(raw) && raw > 0 && raw <= 3600) {
    return raw;
  }
  return 900;
}

export function resolveVoiceMcpToolTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VOICE_MCP_TOOL_TIMEOUT_MS ?? '');
  if (Number.isFinite(raw) && raw >= 1000 && raw <= 60_000) {
    return raw;
  }
  return 10_000;
}

export function resolveVoiceMcpRateLimitPerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VOICE_MCP_RATE_LIMIT_PER_MINUTE ?? '');
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 120;
}
