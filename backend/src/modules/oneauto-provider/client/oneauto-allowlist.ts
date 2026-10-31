import { ONEAUTO_VERIFIED_PROVIDER_CONTRACTS } from '../catalog/oneauto-verified-contracts';

const ALLOWLIST = new Set(
  [...ONEAUTO_VERIFIED_PROVIDER_CONTRACTS.values()].map(
    (c) => `${c.httpMethod}:${normalizePath(c.providerPathTemplate)}`,
  ),
);

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

export function assertOneAutoAllowlistedPath(method: string, relativePath: string): void {
  const key = `${method.toUpperCase()}:${normalizePath(relativePath)}`;
  if (!ALLOWLIST.has(key)) {
    throw Object.assign(new Error(`ONEAUTO_PATH_NOT_ALLOWLISTED:${key}`), {
      code: 'CONTRACT_UNVERIFIED',
    });
  }
}
