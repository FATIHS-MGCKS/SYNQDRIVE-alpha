import { api } from '../../lib/api';

export interface ResolvedScopeEntity {
  id: string;
  label: string;
  sublabel?: string;
}

export async function resolveAuthorizationScopeEntities(
  orgId: string,
  input: {
    vehicleIds?: string[];
    customerIds?: string[];
    bookingIds?: string[];
  },
): Promise<{
  vehicles: ResolvedScopeEntity[];
  customers: ResolvedScopeEntity[];
  bookings: ResolvedScopeEntity[];
}> {
  const vehicleIds = [...new Set(input.vehicleIds ?? [])].slice(0, 50);
  const customerIds = [...new Set(input.customerIds ?? [])].slice(0, 50);
  const bookingIds = [...new Set(input.bookingIds ?? [])].slice(0, 50);

  const [vehicles, customers, bookings] = await Promise.all([
    Promise.all(
      vehicleIds.map(async (id) => {
        try {
          const v = await api.vehicles.getByOrg(orgId, id);
          return {
            id,
            label:
              v.make && v.model
                ? `${v.make} ${v.model}`
                : v.licensePlate ?? `Vehicle ${id.slice(0, 8)}`,
            sublabel: v.licensePlate ?? v.vin ?? undefined,
          };
        } catch {
          return { id, label: `Vehicle ${id.slice(0, 8)}` };
        }
      }),
    ),
    Promise.all(
      customerIds.map(async (id) => {
        try {
          const c = await api.customers.get(orgId, id);
          const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
          return { id, label: name || c.email || `Customer ${id.slice(0, 8)}` };
        } catch {
          return { id, label: `Customer ${id.slice(0, 8)}` };
        }
      }),
    ),
    Promise.all(
      bookingIds.map(async (id) => {
        try {
          const b = await api.bookings.get(orgId, id);
          return {
            id,
            label: b.bookingNumber ?? `Booking ${id.slice(0, 8)}`,
            sublabel: b.status ?? undefined,
          };
        } catch {
          return { id, label: `Booking ${id.slice(0, 8)}` };
        }
      }),
    ),
  ]);

  return { vehicles, customers, bookings };
}
