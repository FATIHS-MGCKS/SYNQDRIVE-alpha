import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { isStepUpRequiredError, newIdempotencyKey } from '../../lib/mfa';
import type {
  OrganizationDimoOwnerHandoffResult,
  OrganizationDimoPrivilegeRecheckResult,
  OrganizationDimoPrivilegeStatusDto,
} from './dimo-privilege.types';
import { pickVehiclePrivilegeRow } from './dimo-privilege.presentation';

type LoadScope = { organizationId: string; vehicleId: string };

export function useConnectedVehicleDimoPrivilege(
  organizationId: string | null,
  vehicleId: string | null,
  enabled: boolean,
) {
  const [status, setStatus] = useState<OrganizationDimoPrivilegeStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [recheckResult, setRecheckResult] = useState<OrganizationDimoPrivilegeRecheckResult | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffResult, setHandoffResult] = useState<OrganizationDimoOwnerHandoffResult | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  const loadGenerationRef = useRef(0);
  const pendingActionRef = useRef<'recheck' | 'handoff' | null>(null);
  const handoffIdempotencyRef = useRef<string | null>(null);
  const scopeRef = useRef<LoadScope | null>(null);

  const resetMutationState = useCallback(() => {
    setRecheckError(null);
    setRecheckResult(null);
    setHandoffError(null);
    setHandoffResult(null);
    setMfaRequired(false);
    pendingActionRef.current = null;
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !organizationId || !vehicleId) {
      setStatus(null);
      setLoadError(null);
      setLoading(false);
      resetMutationState();
      scopeRef.current = null;
      return;
    }

    const generation = ++loadGenerationRef.current;
    scopeRef.current = { organizationId, vehicleId };
    setLoading(true);
    setLoadError(null);
    resetMutationState();

    try {
      const dto = await api.organizations.offboarding.getDimoPrivilegeStatus(organizationId);
      if (generation !== loadGenerationRef.current) return;
      if (scopeRef.current?.organizationId !== organizationId || scopeRef.current?.vehicleId !== vehicleId) {
        return;
      }
      setStatus(dto);
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;
      setStatus(null);
      setLoadError(err instanceof Error ? err.message : 'LOAD_FAILED');
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, organizationId, vehicleId, resetMutationState]);

  useEffect(() => {
    void load();
  }, [load]);

  const vehicleRow = pickVehiclePrivilegeRow(status?.vehicles ?? [], vehicleId);

  const runRecheck = useCallback(async () => {
    if (!organizationId || !vehicleId) return;
    const generation = loadGenerationRef.current;
    setRecheckLoading(true);
    setRecheckError(null);
    setRecheckResult(null);
  pendingActionRef.current = null;
    try {
      const result = await api.organizations.offboarding.recheckDimoPrivilege(organizationId);
      if (generation !== loadGenerationRef.current) return;
      if (scopeRef.current?.organizationId !== organizationId) return;
      setRecheckResult(result);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              lastVerifiedAt: result.lastVerifiedAt,
              providerCheckStatus: result.providerCheckStatus,
              detailCode: result.detailCode,
              vehicles: result.vehicles,
            }
          : null,
      );
    } catch (err) {
      if (isStepUpRequiredError(err)) {
        pendingActionRef.current = 'recheck';
        setMfaRequired(true);
        return;
      }
      if (generation !== loadGenerationRef.current) return;
      setRecheckError(err instanceof Error ? err.message : 'RECHECK_FAILED');
    } finally {
      if (generation === loadGenerationRef.current) {
        setRecheckLoading(false);
      }
    }
  }, [organizationId, vehicleId]);

  const runHandoff = useCallback(async () => {
    if (!organizationId || !vehicleId) return;
    const generation = loadGenerationRef.current;
    if (!handoffIdempotencyRef.current) {
      handoffIdempotencyRef.current = newIdempotencyKey('dimo-owner-handoff');
    }
    setHandoffLoading(true);
    setHandoffError(null);
    setHandoffResult(null);
    pendingActionRef.current = null;
    try {
      const result = await api.organizations.offboarding.recordDimoOwnerHandoff(organizationId, {
        idempotencyKey: handoffIdempotencyRef.current,
        vehicleIds: [vehicleId],
      });
      if (generation !== loadGenerationRef.current) return;
      if (scopeRef.current?.organizationId !== organizationId || scopeRef.current?.vehicleId !== vehicleId) {
        return;
      }
      setHandoffResult(result);
      handoffIdempotencyRef.current = null;
    } catch (err) {
      if (isStepUpRequiredError(err)) {
        pendingActionRef.current = 'handoff';
        setMfaRequired(true);
        return;
      }
      if (generation !== loadGenerationRef.current) return;
      setHandoffError(err instanceof Error ? err.message : 'HANDOFF_FAILED');
    } finally {
      if (generation === loadGenerationRef.current) {
        setHandoffLoading(false);
      }
    }
  }, [organizationId, vehicleId]);

  const retryAfterMfa = useCallback(async () => {
    const pending = pendingActionRef.current;
    setMfaRequired(false);
    pendingActionRef.current = null;
    if (pending === 'recheck') {
      await runRecheck();
    } else if (pending === 'handoff') {
      await runHandoff();
    }
  }, [runRecheck, runHandoff]);

  const dismissMfa = useCallback(() => {
    setMfaRequired(false);
    pendingActionRef.current = null;
  }, []);

  const prepareHandoffIdempotency = useCallback(() => {
    if (!handoffIdempotencyRef.current) {
      handoffIdempotencyRef.current = newIdempotencyKey('dimo-owner-handoff');
    }
    return handoffIdempotencyRef.current;
  }, []);

  return {
    status,
    vehicleRow,
    loading,
    loadError,
    refresh: load,
    recheckLoading,
    recheckError,
    recheckResult,
    runRecheck,
    handoffLoading,
    handoffError,
    handoffResult,
    runHandoff,
    prepareHandoffIdempotency,
    mfaRequired,
    retryAfterMfa,
    dismissMfa,
  };
}