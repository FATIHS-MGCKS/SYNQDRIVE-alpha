import type { NotificationEntityType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export interface EntityLabelContext {
  label: string;
  plate?: string;
  make?: string;
  model?: string;
  year?: number;
  stationName?: string;
}

export interface EnrichableNotificationRow {
  id: string;
  entityType: NotificationEntityType | string;
  entityId: string;
  templateParams: unknown;
}

export async function resolveEntityLabelContexts(
  prisma: PrismaService,
  organizationId: string,
  rows: EnrichableNotificationRow[],
): Promise<Map<string, EntityLabelContext>> {
  const result = new Map<string, EntityLabelContext>();

  const vehicleIds = [
    ...new Set(rows.filter((r) => r.entityType === 'VEHICLE').map((r) => r.entityId)),
  ];
  const stationIds = [
    ...new Set(rows.filter((r) => r.entityType === 'STATION').map((r) => r.entityId)),
  ];
  const bookingIds = [
    ...new Set(rows.filter((r) => r.entityType === 'BOOKING').map((r) => r.entityId)),
  ];

  const [vehicles, stations, bookings] = await Promise.all([
    vehicleIds.length
      ? prisma.vehicle.findMany({
          where: { organizationId, id: { in: vehicleIds } },
          select: { id: true, licensePlate: true, make: true, model: true, year: true },
        })
      : [],
    stationIds.length
      ? prisma.station.findMany({
          where: { organizationId, id: { in: stationIds } },
          select: { id: true, name: true },
        })
      : [],
    bookingIds.length
      ? prisma.booking.findMany({
          where: { organizationId, id: { in: bookingIds } },
          select: {
            id: true,
            vehicle: { select: { licensePlate: true, make: true, model: true } },
          },
        })
      : [],
  ]);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  for (const row of rows) {
    const params = (row.templateParams ?? {}) as Record<string, unknown>;
    const currentLabel = String(params.label ?? params.plate ?? '');

    if (row.entityType === 'VEHICLE') {
      const vehicle = vehicleById.get(row.entityId);
      if (vehicle) {
        const plate = vehicle.licensePlate?.trim() || `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();
        result.set(row.id, {
          label: plate || row.entityId,
          plate: plate || undefined,
          make: vehicle.make ?? undefined,
          model: vehicle.model ?? undefined,
          year: vehicle.year ?? undefined,
        });
      } else if (currentLabel && !isUuidLike(currentLabel)) {
        result.set(row.id, { label: currentLabel, plate: currentLabel });
      }
      continue;
    }

    if (row.entityType === 'STATION') {
      const station = stationById.get(row.entityId);
      if (station) {
        result.set(row.id, { label: station.name, stationName: station.name });
      } else if (params.stationName) {
        const name = String(params.stationName);
        result.set(row.id, { label: name, stationName: name });
      }
      continue;
    }

    if (row.entityType === 'BOOKING') {
      const booking = bookingById.get(row.entityId);
      if (booking) {
        const plate = booking.vehicle.licensePlate?.trim();
        const label = plate || `${booking.vehicle.make ?? ''} ${booking.vehicle.model ?? ''}`.trim() || booking.id;
        result.set(row.id, { label, plate: plate || undefined });
      }
      continue;
    }

    if (currentLabel && !isUuidLike(currentLabel)) {
      result.set(row.id, { label: currentLabel });
    }
  }

  return result;
}

export function mergeEnrichedTemplateParams(
  row: EnrichableNotificationRow,
  contexts: Map<string, EntityLabelContext>,
): Record<string, string | number | boolean | null> {
  const base = {
    ...((row.templateParams ?? {}) as Record<string, string | number | boolean | null>),
  };
  const ctx = contexts.get(row.id);
  if (!ctx) return base;

  const labelNeedsReplace = !base.label || isUuidLike(String(base.label));
  const plateNeedsReplace = !base.plate || isUuidLike(String(base.plate));

  if (labelNeedsReplace && ctx.label) base.label = ctx.label;
  if (plateNeedsReplace && ctx.plate) base.plate = ctx.plate;
  if (ctx.make) base.make = ctx.make;
  if (ctx.model) base.model = ctx.model;
  if (ctx.year != null) base.year = ctx.year;
  if (ctx.stationName && !base.stationName) base.stationName = ctx.stationName;

  return base;
}

export async function enrichTemplateParamsFromLegacyInsights(
  prisma: PrismaService,
  rows: Array<{
    id: string;
    eventType: string;
    legacyInsightId?: string | null;
    templateParams: unknown;
  }>,
  paramsById: Map<string, Record<string, string | number | boolean | null>>,
): Promise<void> {
  const legacyIds = [
    ...new Set(rows.map((row) => row.legacyInsightId).filter((id): id is string => Boolean(id))),
  ];
  if (!legacyIds.length) return;

  const insights = await prisma.dashboardInsight.findMany({
    where: { id: { in: legacyIds } },
    select: { id: true, message: true, metrics: true },
  });
  const insightById = new Map(insights.map((insight) => [insight.id, insight]));

  for (const row of rows) {
    if (!row.legacyInsightId) continue;
    const insight = insightById.get(row.legacyInsightId);
    if (!insight) continue;

    const params = paramsById.get(row.id);
    if (!params) continue;

    const metrics = (insight.metrics ?? {}) as Record<string, unknown>;
    if (typeof metrics.idleDays === 'number' && params.idleDays == null) {
      params.idleDays = metrics.idleDays;
    }
    if (typeof metrics.lostRevenueEur === 'number' && params.lostRevenueEur == null) {
      params.lostRevenueEur = metrics.lostRevenueEur;
    }
    if (typeof metrics.available === 'number' && params.available == null) {
      params.available = metrics.available;
    }
    if (typeof metrics.totalVehicles === 'number' && params.totalVehicles == null) {
      params.totalVehicles = metrics.totalVehicles;
    }
    if (typeof metrics.stationName === 'string' && !params.stationName) {
      params.stationName = metrics.stationName;
    }

    const label = String(params.label ?? '');
    if ((!label || isUuidLike(label)) && typeof insight.message === 'string') {
      const message = insight.message.trim();
      if (message.includes(':')) {
        const head = message.split(':')[0]?.trim();
        if (head && !isUuidLike(head)) {
          params.label = head;
          params.plate = head;
        }
      } else {
        const idleMatch = message.match(/^(.+?)\s+idle\b/i);
        if (idleMatch?.[1]?.trim()) {
          params.label = idleMatch[1].trim();
          params.plate = idleMatch[1].trim();
        }
      }
    }
  }
}
