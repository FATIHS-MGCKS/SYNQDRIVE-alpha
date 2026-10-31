import { ONEAUTO_SERVICE_CATALOG } from '../catalog/oneauto-service-catalog';

const ALLOWLIST = new Set(
  ONEAUTO_SERVICE_CATALOG.map((e) => `${e.httpMethod}:${normalizePath(e.providerPathTemplate)}`),
);

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

export function assertOneAutoAllowlistedPath(method: string, relativePath: string): void {
  const key = `${method.toUpperCase()}:${normalizePath(relativePath)}`;
  if (!ALLOWLIST.has(key)) {
    throw new Error(`ONEAUTO_PATH_NOT_ALLOWLISTED:${key}`);
  }
}
