import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Station } from '../../lib/api';
import type { DamageResponse } from '../../rental/lib/damage.types';
import { operatorApi } from '../lib/operatorApi';
import { useHandoverVehicleTelemetryPrefill } from '../../rental/lib/useHandoverVehicleTelemetryPrefill';
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
import type { OperatorHandoverObservationDraft } from './operatorHandoverTechnicalObservations';

const SIGNABLE_INVALIDATION_FIELDS: Array<keyof OperatorHandoverFormState> = [
  'odometerKm',
  'fuelPercent',
  'fuelFull',
  'checks',
  'warningLightsNotes',
  'notes',
  'selectedDamageIds',
  'technicalObservationDrafts',
  'tireMeasurementCaptured',
  'actualStationId',
];

function patchInvalidatesSignatures(patch: Partial<OperatorHandoverFormState>): boolean {
  return SIGNABLE_INVALIDATION_FIELDS.some((key) => key in patch);
}

function clearInvalidatedSignatures(
  prev: OperatorHandoverFormState,
): Partial<OperatorHandoverFormState> {
  return {
    customerSigData: null,
    staffSigData: null,
    customerSignatureBinding: null,
    staffSignatureBinding: null,
    signaturesInvalidated: true,
  };
}

export function useOperatorHandoverForm(
  isOpen: boolean,
  kind: HandoverDialogKind,
  orgId: string,
  booking: HandoverDialogBookingInfo | null,
  options?: { skipResetOnOpen?: boolean },
) {
  const [state, setState] = useState<OperatorHandoverFormState>(() =>
    createInitialHandoverState(booking, kind),
  );
  const [orgStations, setOrgStations] = useState<Station[]>([]);
  const [damages, setDamages] = useState<OperatorHandoverDamageRow[]>([]);
  const [loadingDamages, setLoadingDamages] = useState(false);
  const [documentsReloadKey, setDocumentsReloadKey] = useState(0);
  const [damageError, setDamageError] = useState<string | null>(null);
  const telemetryAppliedRef = useRef<string | null>(null);

  const { prefill: telemetryPrefill, vehicle: telemetryVehicle } = useHandoverVehicleTelemetryPrefill(
    isOpen,
    orgId,
    booking?.vehicleId,
    kind,
    booking?.pickupOdometerKm,
  );

  useEffect(() => {
    if (!isOpen || !booking || options?.skipResetOnOpen) return;
    telemetryAppliedRef.current = null;
    setState(createInitialHandoverState(booking, kind));
    setDamageError(null);
  }, [isOpen, booking?.id, kind, booking, options?.skipResetOnOpen]);

  useEffect(() => {
    if (!isOpen || !booking) return;
    const key = `${booking.id}:${kind}:${telemetryPrefill.odometerKm}:${telemetryPrefill.fuelPercent}:${telemetryPrefill.fuelFull}`;
    if (telemetryAppliedRef.current === key) return;
    if (!telemetryPrefill.odometerFromTelemetry && !telemetryPrefill.fuelFromTelemetry) return;

    telemetryAppliedRef.current = key;
    setState((prev) => ({
      ...prev,
      odometerKm: telemetryPrefill.odometerKm || prev.odometerKm,
      fuelPercent: telemetryPrefill.fuelFromTelemetry ? telemetryPrefill.fuelPercent : prev.fuelPercent,
      fuelFull: telemetryPrefill.fuelFromTelemetry ? telemetryPrefill.fuelFull : prev.fuelFull,
    }));
  }, [isOpen, booking, kind, telemetryPrefill]);

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
    operatorApi
      .listActiveDamages(orgId, booking.vehicleId, booking.id)
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
  }, [isOpen, booking?.vehicleId, kind, booking, orgId]);

  const patchState = useCallback((patch: Partial<OperatorHandoverFormState>) => {
    setState((prev) => {
      const invalidation = patchInvalidatesSignatures(patch)
        ? clearInvalidatedSignatures(prev)
        : {};
      return { ...prev, ...patch, ...invalidation };
    });
  }, []);

  const toggleCheck = useCallback(
    (field: keyof OperatorHandoverFormState['checks']) => {
      setState((prev) => ({
        ...prev,
        ...clearInvalidatedSignatures(prev),
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
      return {
        ...prev,
        ...clearInvalidatedSignatures(prev),
        selectedDamageIds: next,
      };
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
    if (!booking || !orgId) return;
    setLoadingDamages(true);
    try {
      const rows = await operatorApi.listActiveDamages(orgId, booking.vehicleId, booking.id);
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
  }, [booking, orgId]);

  const stationOptions =
    kind === 'PICKUP' ? stationsForPickup(orgStations) : stationsForReturn(orgStations);

  const markTireMeasurementCaptured = useCallback(() => {
    setState((prev) => ({ ...prev, tireMeasurementCaptured: true }));
  }, []);

  const addTechnicalObservationDraft = useCallback((draft: OperatorHandoverObservationDraft) => {
    setState((prev) => ({
      ...prev,
      technicalObservationDrafts: [...prev.technicalObservationDrafts, draft],
    }));
  }, []);

  const removeTechnicalObservationDraft = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      technicalObservationDrafts: prev.technicalObservationDrafts.filter((d) => d.id !== id),
    }));
  }, []);

  return {
    booking,
    kind,
    state,
    telemetryPrefill,
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
    addTechnicalObservationDraft,
    removeTechnicalObservationDraft,
  };
}

export type OperatorHandoverFormApi = ReturnType<typeof useOperatorHandoverForm>;
