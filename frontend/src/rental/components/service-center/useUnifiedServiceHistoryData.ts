import { useEffect, useMemo, useState } from 'react';
import { api, type ApiServiceCase, type ApiTask, type VehicleServiceEventRecord } from '../../lib/api';
import type { Invoice } from '../components/invoices/invoiceTypes';

const MAX_SERVICE_EVENT_VEHICLES = 24;

export interface UnifiedServiceHistoryData {
  serviceCases: ApiServiceCase[];
  serviceEvents: VehicleServiceEventRecord[];
  invoicesById: Map<string, Pick<Invoice, 'id' | 'invoiceNumberDisplay' | 'title' | 'invoiceDate' | 'vehicleId' | 'vendorId'>>;
  loading: boolean;
  error: string | null;
}

function collectVehicleIds(tasks: ApiTask[], serviceCases: ApiServiceCase[], vehicleFilter?: string): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (vehicleFilter && task.vehicleId !== vehicleFilter) continue;
    if (task.vehicleId) ids.add(task.vehicleId);
  }
  for (const serviceCase of serviceCases) {
    if (vehicleFilter && serviceCase.vehicleId !== vehicleFilter) continue;
    if (serviceCase.vehicleId) ids.add(serviceCase.vehicleId);
  }
  return [...ids];
}

function collectInvoiceIds(tasks: ApiTask[]): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.invoiceId) ids.add(task.invoiceId);
  }
  return [...ids];
}

export function useUnifiedServiceHistoryData(
  orgId: string | null | undefined,
  tasks: ApiTask[],
  options: { vehicleId?: string; enabled?: boolean } = {},
): UnifiedServiceHistoryData {
  const enabled = options.enabled ?? true;
  const [serviceCases, setServiceCases] = useState<ApiServiceCase[]>([]);
  const [serviceEvents, setServiceEvents] = useState<VehicleServiceEventRecord[]>([]);
  const [invoicesById, setInvoicesById] = useState<
    Map<string, Pick<Invoice, 'id' | 'invoiceNumberDisplay' | 'title' | 'invoiceDate' | 'vehicleId' | 'vendorId'>>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoiceIds = useMemo(() => collectInvoiceIds(tasks), [tasks]);

  useEffect(() => {
    if (!enabled || !orgId) {
      setServiceCases([]);
      setServiceEvents([]);
      setInvoicesById(new Map());
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const caseFilters = options.vehicleId ? { vehicleId: options.vehicleId } : undefined;
        const cases = await api.serviceCases.list(orgId!, caseFilters);
        if (cancelled) return;

        const scopedCases = Array.isArray(cases) ? cases : [];
        setServiceCases(scopedCases);

        const vehicleIds = collectVehicleIds(tasks, scopedCases, options.vehicleId).slice(
          0,
          MAX_SERVICE_EVENT_VEHICLES,
        );
        const eventResults = await Promise.all(
          vehicleIds.map(async (vehicleId) => {
            try {
              const response = await api.vehicles.serviceEvents(vehicleId);
              return Array.isArray(response?.data) ? response.data : [];
            } catch {
              return [] as VehicleServiceEventRecord[];
            }
          }),
        );
        if (cancelled) return;
        setServiceEvents(eventResults.flat());

        const invoiceIdSet = new Set(invoiceIds);
        if (invoiceIdSet.size > 0) {
          const invoices = await api.invoices.list(orgId!).catch(() => [] as Invoice[]);
          if (cancelled) return;
          const map = new Map<
            string,
            Pick<Invoice, 'id' | 'invoiceNumberDisplay' | 'title' | 'invoiceDate' | 'vehicleId' | 'vendorId'>
          >();
          for (const invoice of invoices) {
            if (!invoiceIdSet.has(invoice.id)) continue;
            map.set(invoice.id, {
              id: invoice.id,
              invoiceNumberDisplay: invoice.invoiceNumberDisplay,
              title: invoice.title,
              invoiceDate: invoice.invoiceDate,
              vehicleId: invoice.vehicleId,
              vendorId: invoice.vendorId,
            });
          }
          setInvoicesById(map);
        } else {
          setInvoicesById(new Map());
        }
      } catch {
        if (!cancelled) {
          setServiceCases([]);
          setServiceEvents([]);
          setInvoicesById(new Map());
          setError('Servicehistorie konnte nicht vollständig geladen werden.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, orgId, tasks, invoiceIds, options.vehicleId]);

  return {
    serviceCases,
    serviceEvents,
    invoicesById,
    loading,
    error,
  };
}
