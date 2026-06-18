import type { DataAuthorizationDto } from '../../../../lib/api';

export interface DataAuthorizationFilters {
  search: string;
  status: string;
  sourceType: string;
  scope: string;
  risk: string;
  dataCategory: string;
}

export function hasActiveDataAuthFilters(filters: DataAuthorizationFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== 'all' ||
    filters.sourceType !== 'all' ||
    filters.scope !== 'all' ||
    filters.risk !== 'all' ||
    filters.dataCategory !== 'all'
  );
}

function normalizeCategory(c: string): string {
  const map: Record<string, string> = {
    vehicle_identity: 'VEHICLE_IDENTITY',
    trip_data: 'TRIP_DATA',
    customer_data: 'CUSTOMER_DATA',
    financial_data: 'FINANCIAL_DATA',
    document_data: 'DOCUMENT_DATA',
    booking_data: 'BOOKING_DATA',
    telematics_usage: 'TELEMETRY_DATA',
    maintenance_data: 'HEALTH_SIGNALS',
    fleet_condition: 'VEHICLE_STATUS',
  };
  return map[c] ?? c.toUpperCase();
}

export function filterDataAuthorizations(
  items: DataAuthorizationDto[],
  filters: DataAuthorizationFilters,
): DataAuthorizationDto[] {
  let result = items;

  if (filters.status !== 'all') {
    result = result.filter((a) => a.statusKey === filters.status);
  }
  if (filters.sourceType !== 'all') {
    result = result.filter((a) => a.sourceType === filters.sourceType);
  }
  if (filters.scope !== 'all') {
    result = result.filter((a) => a.scopeKey === filters.scope);
  }
  if (filters.risk !== 'all') {
    if (filters.risk === 'HIGH') {
      result = result.filter(
        (a) => a.riskLevelKey === 'HIGH' || a.riskLevelKey === 'CRITICAL',
      );
    } else {
      result = result.filter((a) => a.riskLevelKey === filters.risk);
    }
  }
  if (filters.dataCategory !== 'all') {
    result = result.filter((a) =>
      a.dataCategories.some((c) => normalizeCategory(c) === filters.dataCategory),
    );
  }

  const q = filters.search.trim().toLowerCase();
  if (q) {
    result = result.filter((a) => {
      const haystack = [
        a.title,
        a.description,
        a.requestingEntity,
        a.processorName,
        a.moduleOrigin,
        a.purpose,
        ...(a.purposes ?? []),
        a.destination,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return result;
}

export function formatAuthDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const SCOPE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktiv nutzbar',
  PENDING: 'Wartet auf Freigabe',
  NO_ACTIVE_VEHICLES: 'Kein aktiver Fahrzeug-Scope',
  REVOKED: 'Widerrufen',
  EXPIRED: 'Abgelaufen',
};

/**
 * Human label for the defensive `scopeStatus` field. Falls back to a derived
 * value when the backend has not (yet) populated the field, so an empty
 * vehicle scope never reads as a normal active authorization.
 */
export function labelScopeStatus(auth: DataAuthorizationDto): string {
  const status =
    auth.scopeStatus ??
    (auth.statusKey === 'ACTIVE' && (auth.vehicleCount ?? 0) === 0
      ? 'NO_ACTIVE_VEHICLES'
      : auth.statusKey);
  const base = SCOPE_STATUS_LABELS[status] ?? status;
  const count = auth.vehicleCount ?? auth.vehicleIds?.length ?? 0;
  if (auth.scopeKey === 'CONNECTED_VEHICLES' || auth.scopeKey === 'VEHICLE') {
    return `${base} · ${count} Fahrzeug${count === 1 ? '' : 'e'}`;
  }
  return base;
}

export function affectedObjectsSummary(auth: DataAuthorizationDto): string {
  const v = auth.vehicleCount ?? auth.vehicleIds?.length ?? 0;
  const c = auth.customerIds?.length ?? 0;
  const b = auth.bookingIds?.length ?? 0;

  if (auth.scopeKey === 'ORGANIZATION') return 'Gesamte Organisation';
  if (v > 0) return `${v} Fahrzeug${v === 1 ? '' : 'e'}`;
  if (c > 0) return `${c} Kunde${c === 1 ? '' : 'n'}`;
  if (b > 0) return `${b} Buchung${b === 1 ? '' : 'en'}`;
  if (auth.scopeKey === 'CONNECTED_VEHICLES') return '0 verbundene Fahrzeuge';
  return '—';
}

export function serverListParams(filters: DataAuthorizationFilters) {
  return {
    status: filters.status !== 'all' ? filters.status : undefined,
    sourceType: filters.sourceType !== 'all' ? filters.sourceType : undefined,
    scope: filters.scope !== 'all' ? filters.scope : undefined,
    q: filters.search.trim() || undefined,
  };
}
