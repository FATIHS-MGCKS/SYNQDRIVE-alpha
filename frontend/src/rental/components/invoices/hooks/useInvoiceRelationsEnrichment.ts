import { useEffect, useState } from 'react';

import { api, type BookingDetailDto, type CustomerApiRecord } from '../../../../lib/api';
import { useRentalOrg } from '../../../RentalContext';
import type { Invoice } from '../invoiceTypes';
import type { InvoiceRelationsEnrichment } from '../invoiceRelations.mapper';
import type { InvoiceLookupVehicle } from './useInvoices';

type FetchState = 'idle' | 'loading' | 'ready';

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  return status === 404;
}

export function useInvoiceRelationsEnrichment(
  orgId: string,
  invoice: Invoice | null,
): { enrichment: InvoiceRelationsEnrichment; loading: boolean } {
  const [state, setState] = useState<FetchState>('idle');
  const [enrichment, setEnrichment] = useState<InvoiceRelationsEnrichment>({});

  useEffect(() => {
    if (!orgId || !invoice) {
      setEnrichment({});
      setState('idle');
      return;
    }

    let cancelled = false;
    setState('loading');

    const load = async () => {
      const next: InvoiceRelationsEnrichment = {};

      const tasks: Promise<void>[] = [];

      if (invoice.customerId) {
        tasks.push(
          api.customers
            .get(orgId, invoice.customerId)
            .then((customer) => {
              next.customer = customer as CustomerApiRecord;
              next.customerFetchState = 'ok';
            })
            .catch((err) => {
              next.customerFetchState = isNotFoundError(err) ? 'not_found' : 'error';
            }),
        );
      }

      if (invoice.bookingId) {
        tasks.push(
          api.bookings
            .detail(orgId, invoice.bookingId)
            .then((booking) => {
              next.booking = booking as BookingDetailDto;
              next.bookingFetchState = 'ok';
            })
            .catch((err) => {
              next.bookingFetchState = isNotFoundError(err) ? 'not_found' : 'error';
            }),
        );
      }

      if (invoice.vehicleId) {
        tasks.push(
          api.vehicles
            .listByOrg(orgId)
            .then((res) => {
              const list = (Array.isArray(res) ? res : res?.data || []) as InvoiceLookupVehicle[];
              const vehicle = list.find((v) => v.id === invoice.vehicleId) ?? null;
              if (vehicle) {
                next.vehicle = vehicle;
                next.vehicleFetchState = 'ok';
              } else {
                next.vehicleFetchState = 'not_found';
              }
            })
            .catch(() => {
              next.vehicleFetchState = 'error';
            }),
        );
      }

      tasks.push(
        api.activityLog
          .listByOrg(orgId, { entity: 'INVOICE', limit: 40 })
          .then((res) => {
            const logs = res?.data ?? [];
            const match = logs.find(
              (log) =>
                log.description?.includes(invoice.id) ||
                log.description?.includes(invoice.invoiceNumberDisplay),
            );
            if (match?.userName?.trim()) {
              next.createdByUserName = match.userName.trim();
            }
          })
          .catch(() => {
            /* optional enrichment */
          }),
      );

      await Promise.all(tasks);

      if (!cancelled) {
        setEnrichment(next);
        setState('ready');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [orgId, invoice?.id, invoice?.customerId, invoice?.bookingId, invoice?.vehicleId]);

  return {
    enrichment,
    loading: state === 'loading',
  };
}

export function useInvoiceRelationsPermissions() {
  const { hasPermission } = useRentalOrg();

  return {
    canReadCustomers: hasPermission('customers', 'read'),
    canReadBookings: hasPermission('bookings', 'read'),
    canReadFleet: hasPermission('fleet', 'read'),
  };
}
