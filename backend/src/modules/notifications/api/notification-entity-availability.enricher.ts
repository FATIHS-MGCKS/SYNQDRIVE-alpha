import type { NotificationEntityType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { EnrichableNotificationRow } from './notification-entity-label.enricher';

/** Whether the notification's primary entity still exists in the tenant scope. */
export async function resolveEntityAvailability(
  prisma: PrismaService,
  organizationId: string,
  rows: EnrichableNotificationRow[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  const byType = new Map<NotificationEntityType | string, Set<string>>();
  for (const row of rows) {
    const set = byType.get(row.entityType) ?? new Set<string>();
    set.add(row.entityId);
    byType.set(row.entityType, set);
  }

  const exists = new Map<string, Set<string>>();

  const vehicleIds = [...(byType.get('VEHICLE') ?? [])];
  if (vehicleIds.length) {
    const rowsFound = await prisma.vehicle.findMany({
      where: { organizationId, id: { in: vehicleIds } },
      select: { id: true },
    });
    exists.set('VEHICLE', new Set(rowsFound.map((r) => r.id)));
  }

  const stationIds = [...(byType.get('STATION') ?? [])];
  if (stationIds.length) {
    const rowsFound = await prisma.station.findMany({
      where: { organizationId, id: { in: stationIds } },
      select: { id: true },
    });
    exists.set('STATION', new Set(rowsFound.map((r) => r.id)));
  }

  const bookingIds = [...(byType.get('BOOKING') ?? [])];
  if (bookingIds.length) {
    const rowsFound = await prisma.booking.findMany({
      where: { organizationId, id: { in: bookingIds } },
      select: { id: true },
    });
    exists.set('BOOKING', new Set(rowsFound.map((r) => r.id)));
  }

  const customerIds = [...(byType.get('CUSTOMER') ?? [])];
  if (customerIds.length) {
    const rowsFound = await prisma.customer.findMany({
      where: { organizationId, id: { in: customerIds } },
      select: { id: true },
    });
    exists.set('CUSTOMER', new Set(rowsFound.map((r) => r.id)));
  }

  const invoiceIds = [...(byType.get('INVOICE') ?? [])];
  if (invoiceIds.length) {
    const rowsFound = await prisma.orgInvoice.findMany({
      where: { organizationId, id: { in: invoiceIds } },
      select: { id: true },
    });
    exists.set('INVOICE', new Set(rowsFound.map((r) => r.id)));
  }

  const tripIds = [...(byType.get('TRIP') ?? [])];
  if (tripIds.length) {
    const rowsFound = await prisma.vehicleTrip.findMany({
      where: { id: { in: tripIds }, vehicle: { organizationId } },
      select: { id: true },
    });
    exists.set('TRIP', new Set(rowsFound.map((r) => r.id)));
  }

  for (const row of rows) {
    if (row.entityType === 'ORGANIZATION' || row.entityType === 'FLEET') {
      result.set(row.id, true);
      continue;
    }
    const typeSet = exists.get(row.entityType);
    result.set(row.id, typeSet?.has(row.entityId) ?? false);
  }

  return result;
}
