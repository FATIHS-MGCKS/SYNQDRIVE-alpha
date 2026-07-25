import { clearAuth, getToken } from '../../lib/auth';
import { dispatchOperatorAuthExpired } from '../connectivity/operatorConnectivity.events';

const BASE_URL = '/api/v1';

/** Fetch operator-sensitive resources without HTTP cache retention. */
export async function operatorSensitiveFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    dispatchOperatorAuthExpired();
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  return res;
}

export async function operatorSensitiveJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await operatorSensitiveFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function openOperatorPreviewPath(previewPath: string): Promise<void> {
  const res = await operatorSensitiveFetch(previewPath);
  if (!res.ok) {
    throw new Error('Vorschau nicht verfügbar');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
