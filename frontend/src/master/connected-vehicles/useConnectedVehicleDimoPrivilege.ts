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

function scopeKey(scope: LoadScope): string {
  return `${scope.organizationId}:${scope.vehicleId}`;
}

function isStaleScopedMutation(
  mutationGeneration: number,
  requestScope: LoadScope,
  loadGeneration: number,
  activeScope: LoadScope | null,
): boolean {
  if (mutationGeneration !== loadGeneration) return true;
  if (!activeScope) return true;
  return (
    activeScope.organizationId !== requestScope.organizationId ||
    activeScope.vehicleId !== requestScope.vehicleId
  );
}

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
  const pendingActionScopeRef = useRef<LoadScope | null>(null);
  const handoffIdempotencyRef = useRef<string | null>(null);
  const handoffIdempotencyScopeRef = useRef<string | null>(null);
  const activeScopeRef = useRef<LoadScope | null>(null);

  const clearVehicleSession = useCallback(() => {
    handoffIdempotencyRef.current = null;
    handoffIdempotencyScopeRef.current = null;
    pendingActionRef.current = null;
    pendingActionScopeRef.current = null;
    setMfaRequired(false);
    setRecheckError(null);
    setRecheckResult(null);
    setHandoffError(null);
    setHandoffResult(null);
  }, []);

  useEffect(() => {
    if (!organizationId || !vehicleId) {
      activeScopeRef.current = null;
      clearVehicleSession();
      return;
    }
    const next: LoadScope = { organizationId, vehicleId };
    const prev = activeScopeRef.current;
    if (prev && (prev.organizationId !== next.organizationId || prev.vehicleId !== next.vehicleId)) {
      clearVehicleSession();
    }
    activeScopeRef.current = next;
  }, [organizationId, vehicleId, clearVehicleSession]);

  const resetMutationState = useCallback(() => {
    setRecheckError(null);
    setRecheckResult(null);
    setHandoffError(null);
    setHandoffResult(null);
    setMfaRequired(false);
    pendingActionRef.current = null;
    pendingActionScopeRef.current = null;
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !organizationId || !vehicleId) {
      setStatus(null);
      setLoadError(null);
      setLoading(false);
      resetMutationState();
      activeScopeRef.current = null;
      return;
    }

    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    resetMutationState();

    try {
      const dto = await api.organizations.offboarding.getDimoPrivilegeStatus(organizationId);
      if (generation !== loadGenerationRef.current) return;
      const scope = activeScopeRef.current;
      if (!scope || scope.organizationId !== organizationId || scope.vehicleId !== vehicleId) {
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

  const assertActiveScope = useCallback((): LoadScope | null => {
    if (!organizationId || !vehicleId) return null;
    const scope = activeScopeRef.current;
    if (!scope || scope.organizationId !== organizationId || scope.vehicleId !== vehicleId) {
      return null;
    }
    return scope;
  }, [organizationId, vehicleId]);

  const runRecheck = useCallback(async () => {
    const scope = assertActiveScope();
    if (!scope) return;
    const generation = loadGenerationRef.current;
    setRecheckLoading(true);
    setRecheckError(null);
    setRecheckResult(null);
    pendingActionRef.current = null;
    pendingActionScopeRef.current = null;
    try {
      const result = await api.organizations.offboarding.recheckDimoPrivilege(scope.organizationId);
      if (generation !== loadGenerationRef.current) return;
      if (!assertActiveScope()) return;
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
        if (
          isStaleScopedMutation(generation, scope, loadGenerationRef.current, activeScopeRef.current)
        ) {
          return;
        }
        pendingActionRef.current = 'recheck';
        pendingActionScopeRef.current = { ...scope };
        setMfaRequired(true);
        return;
      }
      if (generation !== loadGenerationRef.current) return;
      if (!assertActiveScope()) return;
      setRecheckError(err instanceof Error ? err.message : 'RECHECK_FAILED');
    } finally {
      if (generation === loadGenerationRef.current) {
        setRecheckLoading(false);
      }
    }
  }, [assertActiveScope]);

  const ensureHandoffIdempotencyKey = useCallback(
    (scope: LoadScope) => {
      const keyForScope = scopeKey(scope);
      if (!handoffIdempotencyRef.current || handoffIdempotencyScopeRef.current !== keyForScope) {
        handoffIdempotencyRef.current = newIdempotencyKey('dimo-owner-handoff');
        handoffIdempotencyScopeRef.current = keyForScope;
      }
      return handoffIdempotencyRef.current;
    },
    [],
  );

  const runHandoff = useCallback(async () => {
    const scope = assertActiveScope();
    if (!scope) return;
    const generation = loadGenerationRef.current;
    const idempotencyKey = ensureHandoffIdempotencyKey(scope);
    setHandoffLoading(true);
    setHandoffError(null);
    setHandoffResult(null);
    pendingActionRef.current = null;
    pendingActionScopeRef.current = null;
    try {
      const result = await api.organizations.offboarding.recordDimoOwnerHandoff(scope.organizationId, {
        idempotencyKey,
        vehicleIds: [scope.vehicleId],
      });
      if (generation !== loadGenerationRef.current) return;
      if (!assertActiveScope()) return;
      setHandoffResult(result);
      handoffIdempotencyRef.current = null;
      handoffIdempotencyScopeRef.current = null;
    } catch (err) {
      if (isStepUpRequiredError(err)) {
        if (
          isStaleScopedMutation(generation, scope, loadGenerationRef.current, activeScopeRef.current)
        ) {
          return;
        }
        pendingActionRef.current = 'handoff';
        pendingActionScopeRef.current = { ...scope };
        setMfaRequired(true);
        return;
      }
      if (generation !== loadGenerationRef.current) return;
      if (!assertActiveScope()) return;
      setHandoffError(err instanceof Error ? err.message : 'HANDOFF_FAILED');
    } finally {
      if (generation === loadGenerationRef.current) {
        setHandoffLoading(false);
      }
    }
  }, [assertActiveScope, ensureHandoffIdempotencyKey]);

  const retryAfterMfa = useCallback(async () => {
    const pending = pendingActionRef.current;
    const pendingScope = pendingActionScopeRef.current;
    const active = assertActiveScope();
    setMfaRequired(false);
    pendingActionRef.current = null;
    pendingActionScopeRef.current = null;

    if (!pending || !pendingScope || !active) {
      return;
    }
    if (
      pendingScope.organizationId !== active.organizationId ||
      pendingScope.vehicleId !== active.vehicleId
    ) {
      return;
    }

    if (pending === 'recheck') {
      await runRecheck();
    } else if (pending === 'handoff') {
      await runHandoff();
    }
  }, [assertActiveScope, runRecheck, runHandoff]);

  const dismissMfa = useCallback(() => {
    setMfaRequired(false);
    pendingActionRef.current = null;
    pendingActionScopeRef.current = null;
  }, []);

  const prepareHandoffIdempotency = useCallback(() => {
    const scope = assertActiveScope();
    if (!scope) return null;
    return ensureHandoffIdempotencyKey(scope);
  }, [assertActiveScope, ensureHandoffIdempotencyKey]);

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