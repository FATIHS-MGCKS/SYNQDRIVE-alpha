import type { MasterContractSyncStatus } from '../../types/master-contract.types';

const DOMAIN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  TRIALING: 'Testphase',
  ACTIVE: 'Aktiv',
  PAUSED: 'Pausiert',
  PAST_DUE: 'Überfällig',
  CANCEL_SCHEDULED: 'Kündigung geplant',
  CANCELLED: 'Gekündigt',
};

const ERROR_LABELS: Record<string, string> = {
  ORGANIZATION_NOT_FOUND: 'Organisation wurde nicht gefunden.',
  SUBSCRIPTION_NOT_FOUND: 'Für diese Organisation existiert kein Vertrag.',
  IDEMPOTENCY_KEY_REQUIRED: 'Idempotency-Key fehlt. Bitte Aktion erneut starten.',
  IDEMPOTENCY_REPLAY: 'Diese Aktion wurde bereits verarbeitet.',
  PRICE_VERSION_ARCHIVED: 'Die gewählte Preisversion ist archiviert.',
  BASE_PLAN_NOT_ASSIGNED: 'Bitte zuerst einen Tarif (Rental oder Fleet) zuweisen.',
  INVALID_TRANSITION: 'Diese Statusänderung ist im aktuellen Vertragszustand nicht möglich.',
  OPTIMISTIC_LOCK_CONFLICT: 'Der Vertrag wurde zwischenzeitlich geändert. Bitte neu laden.',
};

export function createMasterContractIdempotencyKey(action: string, orgId: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `master-contract:${action}:${orgId}:${random}`;
}

export function mapMasterContractError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const codeMatch = message.match(/\[([A-Z0-9_]+)\]/);
  const code = codeMatch?.[1];
  if (code && ERROR_LABELS[code]) {
    return ERROR_LABELS[code];
  }
  if (message.toLowerCase().includes('optimistic') || message.includes('lock')) {
    return ERROR_LABELS.OPTIMISTIC_LOCK_CONFLICT;
  }
  return message || 'Vertragsaktion fehlgeschlagen.';
}

export function domainStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Kein Vertrag';
  return DOMAIN_STATUS_LABELS[status] ?? status;
}

export function domainStatusTone(status: string | null | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'sq-tone-success';
    case 'TRIALING':
      return 'sq-tone-info';
    case 'PAST_DUE':
    case 'CANCEL_SCHEDULED':
      return 'sq-tone-warning';
    case 'PAUSED':
    case 'CANCELLED':
      return 'sq-tone-neutral';
    case 'DRAFT':
      return 'sq-tone-neutral';
    default:
      return 'sq-tone-neutral';
  }
}

export function syncStatusLabel(status: MasterContractSyncStatus | string | undefined): string {
  switch (status) {
    case 'SYNCED':
      return 'Synchronisiert';
    case 'PARTIAL':
      return 'Teilweise';
    case 'MISSING':
      return 'Fehlt';
    case 'NONE':
      return 'Kein Vertrag';
    default:
      return status ?? '—';
  }
}

export function syncStatusTone(status: MasterContractSyncStatus | string | undefined): string {
  switch (status) {
    case 'SYNCED':
      return 'sq-tone-success';
    case 'PARTIAL':
      return 'sq-tone-warning';
    case 'MISSING':
      return 'sq-tone-critical';
    default:
      return 'sq-tone-neutral';
  }
}

export function tariffLabelFromRow(tariffLabel?: string | null, productKey?: string | null): string {
  if (tariffLabel) return tariffLabel;
  if (productKey === 'RENTAL') return 'Rental';
  if (productKey === 'FLEET') return 'Fleet';
  return '—';
}

export function readLockVersion(
  rowLockVersion?: number,
  contractLockVersion?: number,
): number | undefined {
  return contractLockVersion ?? rowLockVersion;
}
