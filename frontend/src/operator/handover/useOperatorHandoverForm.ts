import { useCallback, useEffect, useState } from 'react';
import { api, type Station } from '../../lib/api';
import type { DamageResponse } from '../../rental/lib/damage.types';
import { stationsForPickup, stationsForReturn } from '../../rental/lib/stationBookingUtils';
import type {
  HandoverDialogBookingInfo,
  HandoverDialogKind,
} from '../../rental/components/handover/HandoverProtocolDialog';
import {
  createInitialHandoverState,
  type OperatorHandoverDamageRow,
  type OperatorHandoverFormState,
} from './operatorHandoverPayload';

export function useOperatorHandoverForm(
  isOpen: boolean,
  kind: HandoverDialogKind,
  orgId: string,
  booking: HandoverDialogBookingInfo | null,
) {
  const [state, setState] = useState<OperatorHandoverFormState>(() =>
    createInitialHandoverState(booking, kind),
  );
  const [orgStations, setOrgStations] = useState<Station[]>([]);
  const [damages, setDamages] = useState<OperatorHandoverDamageRow[]>([]);
  const [loadingDamages, setLoadingDamages] = useState(false);
  const [documentsReloadKey, setDocumentsReloadKey] = useState(0);
  const [damageError, setDamageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !booking) return;
    setState(createInitialHandoverState(booking, kind));
    setDamageError(null);
  }, [isOpen, booking?.id, kind, booking]);

  /** Drop signature bitmaps from memory when the flow closes (sensitive data). */
  useEffect(() => {
    if (isOpen) return;
    setState((prev) => ({
      ...prev,
      customerSigData: null,
      staffSigData: null,
    }));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !orgId) return;
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setOrgStations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOrgStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId]);

  const reloadDocuments = useCallback(async () => {
    if (!booking || !orgId) return;
    try {
      await api.documents.listForBooking(orgId, booking.id);
    } catch {
      /* panel reloads independently */
    }
    setDocumentsReloadKey((k) => k + 1);
  }, [booking, orgId]);

  useEffect(() => {
    if (!isOpen || !booking) return;
    let cancelled = false;
    setLoadingDamages(true);
    api.vehicleIntelligence
      .damagesActive(booking.vehicleId)
      .then((rows) => {
        if (cancelled) return;
        const list: OperatorHandoverDamageRow[] = Array.isArray(rows)
          ? rows.map((r) => ({
              id: String(r.id),
              damageType: String(r.damageType ?? 'OTHER'),
              severity: String(r.severity ?? 'MINOR'),
              description: r.description ?? null,
              locationLabel: r.locationLabel ?? null,
            }))
          : [];
        setDamages(list);
        if (kind === 'PICKUP') {
          setState((prev) => ({
            ...prev,
            selectedDamageIds: new Set(list.map((d) => d.id)),
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setDamages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDamages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, booking?.vehicleId, kind, booking]);

  const patchState = useCallback((patch: Partial<OperatorHandoverFormState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleCheck = useCallback(
    (field: keyof OperatorHandoverFormState['checks']) => {
      setState((prev) => ({
        ...prev,
        checks: { ...prev.checks, [field]: !prev.checks[field] },
      }));
    },
    [],
  );

  const toggleDamage = useCallback((id: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedDamageIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedDamageIds: next };
    });
  }, []);

  const registerCapturedDamage = useCallback((created: DamageResponse) => {
    const row: OperatorHandoverDamageRow = {
      id: String(created.id),
      damageType: String(created.damageType ?? 'OTHER'),
      severity: String(created.severity ?? 'MINOR'),
      description: created.description ?? null,
      locationLabel: created.locationLabel ?? null,
    };
    setDamages((prev) => [row, ...prev.filter((d) => d.id !== row.id)]);
    setState((prev) => ({
      ...prev,
      selectedDamageIds: new Set([...prev.selectedDamageIds, row.id]),
    }));
    setDamageError(null);
  }, []);

  const reloadDamages = useCallback(async () => {
    if (!booking) return;
    setLoadingDamages(true);
    try {
      const rows = await api.vehicleIntelligence.damagesActive(booking.vehicleId);
      const list: OperatorHandoverDamageRow[] = Array.isArray(rows)
        ? rows.map((r) => ({
            id: String(r.id),
            damageType: String(r.damageType ?? 'OTHER'),
            severity: String(r.severity ?? 'MINOR'),
            description: r.description ?? null,
            locationLabel: r.locationLabel ?? null,
          }))
        : [];
      setDamages(list);
    } catch {
      /* keep list */
    } finally {
      setLoadingDamages(false);
    }
  }, [booking]);

  const stationOptions =
    kind === 'PICKUP' ? stationsForPickup(orgStations) : stationsForReturn(orgStations);

  const markTireMeasurementCaptured = useCallback(() => {
    setState((prev) => ({ ...prev, tireMeasurementCaptured: true }));
  }, []);

  return {
    booking,
    kind,
    state,
    setState,
    patchState,
    toggleCheck,
    toggleDamage,
    orgStations,
    stationOptions,
    damages,
    loadingDamages,
    documentsReloadKey,
    damageError,
    registerCapturedDamage,
    reloadDamages,
    reloadDocuments,
    markTireMeasurementCaptured,
  };
}

export type OperatorHandoverFormApi = ReturnType<typeof useOperatorHandoverForm>;
