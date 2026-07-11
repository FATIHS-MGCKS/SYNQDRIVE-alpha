import type { NotificationEntityType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeDtcCode } from '@modules/vehicle-intelligence/dtc-knowledge/dtc-knowledge.util';

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

function isGenericDtcDescription(description: string | null | undefined, code: string): boolean {
  if (!description?.trim()) return true;
  const normalized = description.trim();
  if (normalized === `DTC ${code}`) return true;
  if (normalized === code) return true;
  return false;
}

function pickDtcReasonText(opts: {
  code: string;
  eventDescription?: string | null;
  knowledgeTitle?: string | null;
  knowledgeShort?: string | null;
  vehicleTitle?: string | null;
}): string | null {
  const { code } = opts;
  if (opts.vehicleTitle?.trim()) return opts.vehicleTitle.trim();
  if (opts.knowledgeTitle?.trim()) return opts.knowledgeTitle.trim();
  if (opts.eventDescription && !isGenericDtcDescription(opts.eventDescription, code)) {
    return opts.eventDescription.trim();
  }
  if (opts.knowledgeShort?.trim()) return opts.knowledgeShort.trim();
  return null;
}

/** Fills `templateParams.reason` for ACTIVE_DTC from DTC events + knowledge base. */
export async function enrichActiveDtcTemplateParams(
  prisma: PrismaService,
  rows: Array<EnrichableNotificationRow & { eventType?: string }>,
  paramsById: Map<string, Record<string, string | number | boolean | null>>,
): Promise<void> {
  const dtcRows = rows.filter(
    (row) => row.entityType === 'VEHICLE' && row.eventType === 'ACTIVE_DTC',
  );
  if (!dtcRows.length) return;

  const vehicleIds = [...new Set(dtcRows.map((row) => row.entityId))];
  const codes = new Set<string>();
  const normalizedCodes = new Set<string>();

  for (const row of dtcRows) {
    const params = paramsById.get(row.id) ?? {};
    const rawCode = String(params.code ?? '').trim();
    if (!rawCode) continue;
    codes.add(rawCode);
    const normalized = normalizeDtcCode(rawCode);
    if (normalized) normalizedCodes.add(normalized);
  }

  if (!codes.size) return;

  const [vehicles, events, genericKnowledge, vehicleKnowledge] = await Promise.all([
    prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: { id: true, make: true, model: true, year: true },
    }),
    prisma.vehicleDtcEvent.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        dtcCode: { in: [...codes] },
        isActive: true,
      },
      select: { vehicleId: true, dtcCode: true, description: true },
    }),
    normalizedCodes.size
      ? prisma.dtcKnowledge.findMany({
          where: {
            normalizedCode: { in: [...normalizedCodes] },
            language: 'de',
            enrichmentStatus: 'READY',
          },
          select: { normalizedCode: true, title: true, shortDescription: true },
        })
      : Promise.resolve(
          [] as Array<{ normalizedCode: string; title: string; shortDescription: string | null }>,
        ),
    normalizedCodes.size
      ? prisma.dtcVehicleKnowledge.findMany({
          where: {
            normalizedCode: { in: [...normalizedCodes] },
            enrichmentStatus: 'READY',
          },
          select: {
            normalizedCode: true,
            make: true,
            model: true,
            year: true,
            vehicleSpecificTitle: true,
          },
        })
      : Promise.resolve(
          [] as Array<{
            normalizedCode: string;
            make: string | null;
            model: string | null;
            year: number | null;
            vehicleSpecificTitle: string | null;
          }>,
        ),
  ]);

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const eventByKey = new Map(
    events.map((event) => [`${event.vehicleId}:${event.dtcCode.toUpperCase()}`, event]),
  );
  const genericByCode = new Map(genericKnowledge.map((row) => [row.normalizedCode, row]));

  for (const row of dtcRows) {
    const params = paramsById.get(row.id);
    if (!params) continue;

    const rawCode = String(params.code ?? '').trim();
    const normalized = normalizeDtcCode(rawCode);
    if (!normalized) continue;

    const existingReason = String(params.reason ?? '').trim();
    if (existingReason && !/^\{[a-zA-Z]+\}$/.test(existingReason)) continue;

    const vehicle = vehicleById.get(row.entityId);
    const event = eventByKey.get(`${row.entityId}:${rawCode.toUpperCase()}`);
    const generic = genericByCode.get(normalized);
    const vehicleSpecific = vehicleKnowledge.find(
      (vk) =>
        vk.normalizedCode === normalized
        && vk.make === (vehicle?.make ?? null)
        && vk.model === (vehicle?.model ?? null)
        && vk.year === (vehicle?.year ?? null),
    );

    const reason = pickDtcReasonText({
      code: normalized,
      eventDescription: event?.description,
      knowledgeTitle: generic?.title,
      knowledgeShort: generic?.shortDescription,
      vehicleTitle: vehicleSpecific?.vehicleSpecificTitle,
    });

    if (reason) params.reason = reason;
  }
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
