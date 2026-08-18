import type { PlatformOpsState } from './types';
import type { StatusTone } from '../../components/patterns';

export const PLATFORM_OPS_REFRESH_MS = 60_000;
export const PLATFORM_OPS_STALE_MS = 5 * 60_000;

export function platformOpsStateLabel(state: PlatformOpsState): string {
  switch (state) {
    case 'healthy':
      return 'Betriebsbereit';
    case 'degraded':
      return 'Eingeschränkt';
    case 'critical':
      return 'Kritisch';
    case 'stale':
      return 'Veraltet';
    default:
      return 'Unbekannt';
  }
}

export function platformOpsStateTone(state: PlatformOpsState): StatusTone {
  switch (state) {
    case 'healthy':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'critical':
      return 'critical';
    case 'stale':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function formatRelativeDe(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'gerade eben';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `vor ${sec} Sek.`;
  if (sec < 3600) return `vor ${Math.floor(sec / 60)} Min.`;
  if (sec < 86400) return `vor ${Math.floor(sec / 3600)} Std.`;
  return `vor ${Math.floor(sec / 86400)} Tg.`;
}

export const PLATFORM_OPS_SECTIONS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'incidents', label: 'Vorfälle' },
  { id: 'services', label: 'Dienste' },
  { id: 'processing', label: 'Verarbeitung' },
  { id: 'infrastructure', label: 'Infrastruktur' },
  { id: 'resilience', label: 'Resilienz' },
  { id: 'diagnostics', label: 'Diagnostik' },
] as const;

export const SERVICE_GROUP_LABELS: Record<string, string> = {
  core: 'Kern',
  processing: 'Verarbeitung',
  edge: 'Edge',
  external: 'Extern',
};
