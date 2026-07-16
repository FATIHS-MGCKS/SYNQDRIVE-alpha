import { createHash } from 'crypto';
import type {
  OdometerEvidenceSignal,
  SetupBackfillAuditInput,
} from './tire-odometer-anchor-backfill-audit';

function hashRef(prefix: string, id: string): string {
  return `${prefix}_${createHash('sha256').update(id).digest('hex').slice(0, 10)}`;
}

export interface RawSetupRow {
  setup_id: string;
  vehicle_id: string;
  organization_id: string | null;
  installed_at: string | null;
  status: string;
  installed_odometer_km: string | null;
  odometer_anchor_status: string | null;
  total_km_on_set: string | null;
}

export interface RawMeasurementRow {
  setup_id: string;
  measurement_id: string;
  measured_at: string;
  source: string;
  odometer_at_measurement: string | null;
}

export interface RawHandoverRow {
  vehicle_id: string;
  protocol_id: string;
  performed_at: string;
  odometer_km: string;
}

export interface RawSnapshotRow {
  vehicle_id: string;
  snapshot_id: string;
  snapshot_date: string;
  odometer_km: string;
  provider_source: string | null;
}

export interface RawTripRow {
  vehicle_id: string;
  trip_id: string;
  end_time: string;
  odometer_end_km: string | null;
}

export interface RawWorkshopDocRow {
  vehicle_id: string;
  extraction_id: string;
  confirmed_at: string | null;
  odometer_km: string | null;
}

export interface RawHmRow {
  vehicle_id: string;
  fetched_at: string;
  odometer_km: string;
}

export interface RawSiblingSetupRow {
  vehicle_id: string;
  setup_id: string;
  installed_at: string | null;
  installed_odometer_km: string | null;
  status: string;
}

export function mapMeasurementSignals(
  rows: RawMeasurementRow[],
  setupId: string,
): OdometerEvidenceSignal[] {
  const out: OdometerEvidenceSignal[] = [];
  for (const r of rows.filter((row) => row.setup_id === setupId)) {
    const km = Number(r.odometer_at_measurement);
    if (!Number.isFinite(km)) continue;
    const sourceKey = r.source.toLowerCase();
    out.push({
      source:
        sourceKey === 'manual_registration'
          ? 'REGISTRATION_MEASUREMENT'
          : 'DOCUMENTED_INSTALL_MEASUREMENT',
      odometerKm: km,
      observedAt: r.measured_at,
      evidenceRef: hashRef('meas', r.measurement_id),
      notes: [`measurement_source=${r.source}`],
    });
  }
  return out;
}

export function mapHandoverSignals(
  rows: RawHandoverRow[],
  vehicleId: string,
): OdometerEvidenceSignal[] {
  return rows
    .filter((r) => r.vehicle_id === vehicleId)
    .map((r) => ({
      source: 'HANDOVER_PROTOCOL' as const,
      odometerKm: Number(r.odometer_km),
      observedAt: r.performed_at,
      evidenceRef: hashRef('handover', r.protocol_id),
    }))
    .filter((r) => Number.isFinite(r.odometerKm));
}

export function mapSnapshotSignals(
  rows: RawSnapshotRow[],
  vehicleId: string,
): { dimo: OdometerEvidenceSignal[]; hm: OdometerEvidenceSignal[]; generic: OdometerEvidenceSignal[] } {
  const dimo: OdometerEvidenceSignal[] = [];
  const hm: OdometerEvidenceSignal[] = [];
  const generic: OdometerEvidenceSignal[] = [];

  for (const row of rows.filter((r) => r.vehicle_id === vehicleId)) {
    const km = Number(row.odometer_km);
    if (!Number.isFinite(km)) continue;
    const provider = String(row.provider_source ?? '').toUpperCase();
    const base = {
      odometerKm: km,
      observedAt: row.snapshot_date,
      evidenceRef: hashRef('snap', row.snapshot_id),
    };
    if (provider.includes('DIMO')) {
      dimo.push({ ...base, source: 'DIMO_HISTORICAL', providerLabel: 'DIMO' });
    } else if (provider.includes('HIGH_MOBILITY') || provider === 'HM') {
      hm.push({ ...base, source: 'HIGH_MOBILITY_HISTORICAL', providerLabel: 'HIGH_MOBILITY' });
    } else {
      generic.push({ ...base, source: 'SNAPSHOT_HISTORY', providerLabel: provider || 'SNAPSHOT' });
    }
  }

  return { dimo, hm, generic };
}

export function mapTripBoundarySignals(
  rows: RawTripRow[],
  vehicleId: string,
): OdometerEvidenceSignal[] {
  return rows
    .filter((r) => r.vehicle_id === vehicleId && r.odometer_end_km != null)
    .map((r) => ({
      source: 'TRIP_ODOMETER_BOUNDARY' as const,
      odometerKm: Number(r.odometer_end_km),
      observedAt: r.end_time,
      evidenceRef: hashRef('trip', r.trip_id),
      notes: ['explicit_trip_end_odometer_only'],
    }))
    .filter((r) => Number.isFinite(r.odometerKm));
}

export function mapWorkshopDocSignals(
  rows: RawWorkshopDocRow[],
  vehicleId: string,
): OdometerEvidenceSignal[] {
  return rows
    .filter((r) => r.vehicle_id === vehicleId && r.odometer_km != null)
    .map((r) => ({
      source: 'WORKSHOP_TIRE_DOCUMENT' as const,
      odometerKm: Number(r.odometer_km),
      observedAt: r.confirmed_at ?? new Date(0).toISOString(),
      evidenceRef: hashRef('doc', r.extraction_id),
      notes: ['vehicle_document_extraction_tire'],
    }))
    .filter((r) => Number.isFinite(r.odometerKm));
}

export function mapHmSignals(rows: RawHmRow[], vehicleId: string): OdometerEvidenceSignal[] {
  return rows
    .filter((r) => r.vehicle_id === vehicleId)
    .map((r) => ({
      source: 'HIGH_MOBILITY_HISTORICAL' as const,
      odometerKm: Number(r.odometer_km),
      observedAt: r.fetched_at,
      providerLabel: 'HIGH_MOBILITY',
      evidenceRef: hashRef('hm', `${vehicleId}:${r.fetched_at}`),
    }))
    .filter((r) => Number.isFinite(r.odometerKm));
}

export function buildSetupAuditInputFromRaw(args: {
  setup: RawSetupRow;
  measurements: RawMeasurementRow[];
  handovers: RawHandoverRow[];
  snapshots: RawSnapshotRow[];
  trips: RawTripRow[];
  workshopDocs: RawWorkshopDocRow[];
  hmRows: RawHmRow[];
  siblings: RawSiblingSetupRow[];
  tripsAfterInstallKm?: number;
}): SetupBackfillAuditInput {
  const snap = mapSnapshotSignals(args.snapshots, args.setup.vehicle_id);
  const siblings = args.siblings
    .filter((s) => s.vehicle_id === args.setup.vehicle_id && s.setup_id !== args.setup.setup_id)
    .map((s) => ({
      installedAt: s.installed_at,
      odometerKm: s.installed_odometer_km != null ? Number(s.installed_odometer_km) : null,
      status: s.status,
    }));

  const dimo = snap.dimo;
  const hm = [...snap.hm, ...mapHmSignals(args.hmRows, args.setup.vehicle_id)];

  const providerSwitchNotes: string[] = [];
  if (dimo.length > 0 && hm.length > 0) {
    const d = dimo[0]!.odometerKm;
    const h = hm[0]!.odometerKm;
    if (Math.abs(d - h) > 500) {
      providerSwitchNotes.push('dimo_and_hm_disagree_near_install');
    }
  }

  return {
    setupId: args.setup.setup_id,
    vehicleId: args.setup.vehicle_id,
    organizationId: args.setup.organization_id,
    installedAt: args.setup.installed_at,
    status: args.setup.status,
    installedOdometerKm:
      args.setup.installed_odometer_km != null
        ? Number(args.setup.installed_odometer_km)
        : null,
    odometerAnchorStatus: args.setup.odometer_anchor_status,
    totalKmOnSet: Number(args.setup.total_km_on_set ?? 0) || 0,
    installMeasurements: mapMeasurementSignals(args.measurements, args.setup.setup_id).filter(
      (m) => m.source === 'DOCUMENTED_INSTALL_MEASUREMENT',
    ),
    registrationMeasurements: mapMeasurementSignals(args.measurements, args.setup.setup_id).filter(
      (m) => m.source === 'REGISTRATION_MEASUREMENT',
    ),
    handoverProtocols: mapHandoverSignals(args.handovers, args.setup.vehicle_id),
    dimoHistorical: dimo,
    hmHistorical: hm,
    snapshotHistory: snap.generic,
    workshopDocuments: mapWorkshopDocSignals(args.workshopDocs, args.setup.vehicle_id),
    tripBoundaries: mapTripBoundarySignals(args.trips, args.setup.vehicle_id),
    siblingSetupAnchors: siblings,
    providerSwitchNotes,
    tripsAfterInstallKm: args.tripsAfterInstallKm,
  };
}
