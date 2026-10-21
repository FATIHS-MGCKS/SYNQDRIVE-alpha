import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  REFERENCE_CAPTURE_MANIFEST_ID,
  REFERENCE_CAPTURE_MANIFEST_PATH,
} from './reference-capture.constants';
import type { FrozenReferenceManifest, ManifestCanonicalSignal } from './reference-capture.types';

let cachedManifest: FrozenReferenceManifest | null = null;

function resolveManifestPath(): string {
  const candidates = [
    join(process.cwd(), REFERENCE_CAPTURE_MANIFEST_PATH),
    join(process.cwd(), '..', REFERENCE_CAPTURE_MANIFEST_PATH),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function loadFrozenReferenceManifest(): FrozenReferenceManifest {
  if (cachedManifest) return cachedManifest;

  const raw = readFileSync(resolveManifestPath(), 'utf8');
  const parsed = JSON.parse(raw) as FrozenReferenceManifest;

  if (parsed.manifestId !== REFERENCE_CAPTURE_MANIFEST_ID) {
    throw new Error(`Unexpected manifestId: ${parsed.manifestId}`);
  }

  cachedManifest = parsed;
  return parsed;
}

export function resetReferenceManifestCacheForTests(): void {
  cachedManifest = null;
}

export function getManifestCanonicalSignals(): ManifestCanonicalSignal[] {
  return loadFrozenReferenceManifest().canonicalSignals ?? [];
}

export function resolveCanonicalKeyForProviderField(providerField: string): string | null {
  const match = getManifestCanonicalSignals().find((s) => s.providerField === providerField);
  return match?.canonicalKey ?? null;
}

export function buildCanonicalKeyLookup(): Map<string, string> {
  const map = new Map<string, string>();
  for (const signal of getManifestCanonicalSignals()) {
    map.set(signal.providerField, signal.canonicalKey);
  }
  return map;
}
