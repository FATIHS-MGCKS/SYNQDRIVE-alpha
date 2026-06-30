/** Mask an Ethereum-style wallet for safe diagnostics output. */
export function maskDimoAgentWallet(wallet: string): string {
  const w = wallet.trim();
  if (!w) return '';
  if (w.length <= 10) return `${w.slice(0, 4)}…`;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

/** Strip secrets/tokens from agent error messages before returning to clients. */
export function sanitizeDimoAgentErrorMessage(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/DIMO_API_KEY[=:\s"']*[A-Za-z0-9._-]+/gi, 'DIMO_API_KEY [redacted]')
    .replace(/0x[a-fA-F0-9]{40}/g, (addr) => maskDimoAgentWallet(addr))
  .slice(0, 500);
}

export function sanitizeDimoAgentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  return sanitizeDimoAgentErrorMessage(raw);
}
