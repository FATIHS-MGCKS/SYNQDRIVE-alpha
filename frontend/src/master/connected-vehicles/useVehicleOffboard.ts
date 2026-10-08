import { useCallback, useRef, useState } from 'react';
import { api } from '../../lib/api';
import {
  classifyOffboardHttpFailure,
  isTransportUncertainError,
  VehicleOffboardRequestError,
} from './vehicle-offboard.api-error';
import type {
  VehicleOffboardHttpResponse,
  VehicleOffboardIntent,
} from './vehicle-offboard.types';

export type OffboardExecutionState =
  | { phase: 'idle' }
  | { phase: 'submitting'; intent: VehicleOffboardIntent }
  | { phase: 'mfa_required'; intent: VehicleOffboardIntent }
  | { phase: 'uncertain'; intent: VehicleOffboardIntent; message: string }
  | { phase: 'success'; result: VehicleOffboardHttpResponse };

export function useVehicleOffboard() {
  const [state, setState] = useState<OffboardExecutionState>({ phase: 'idle' });
  const httpInFlightRef = useRef(false);
  const pendingIntentRef = useRef<VehicleOffboardIntent | null>(null);

  const clear = useCallback(() => {
    httpInFlightRef.current = false;
    pendingIntentRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  const runHttp = useCallback(async (intent: VehicleOffboardIntent): Promise<VehicleOffboardHttpResponse> => {
    if (httpInFlightRef.current) {
      throw new VehicleOffboardRequestError('Offboard HTTP request already in flight', {
        kind: 'HTTP_REJECTION',
        code: 'OFFBOARD_HTTP_IN_FLIGHT',
        status: 0,
      });
    }
    httpInFlightRef.current = true;
    pendingIntentRef.current = intent;
    setState({ phase: 'submitting', intent });
    try {
      const raw = await api.vehicleOnboarding.offboardVehicle(
        intent.organizationId,
        intent.vehicleId,
        {
          reason: intent.reason,
          idempotencyKey: intent.idempotencyKey,
          note: intent.note,
        },
      );
      const result: VehicleOffboardHttpResponse = {
        ...raw,
        warnings: raw.warnings as VehicleOffboardHttpResponse['warnings'],
      };
      httpInFlightRef.current = false;
      setState({ phase: 'success', result });
      return result;
    } catch (err) {
      httpInFlightRef.current = false;
      if (err instanceof VehicleOffboardRequestError) {
        if (err.kind === 'STEP_UP_REQUIRED') {
          setState({ phase: 'mfa_required', intent });
          throw err;
        }
        if (err.kind === 'MFA_ENROLLMENT_REQUIRED') {
          pendingIntentRef.current = null;
          setState({ phase: 'idle' });
          throw err;
        }
        if (err.kind === 'OPERATIONALLY_BLOCKED' || err.kind === 'SEMANTIC_CONFLICT') {
          pendingIntentRef.current = null;
          setState({ phase: 'idle' });
          throw err;
        }
        pendingIntentRef.current = null;
        setState({ phase: 'idle' });
        throw err;
      }
      if (isTransportUncertainError(err)) {
        setState({
          phase: 'uncertain',
          intent,
          message: err instanceof Error ? err.message : 'Network error',
        });
        throw new VehicleOffboardRequestError(
          err instanceof Error ? err.message : 'Network error',
          { kind: 'TRANSPORT_UNCERTAIN', code: 'TRANSPORT_UNCERTAIN', status: 0 },
        );
      }
      pendingIntentRef.current = null;
      setState({ phase: 'idle' });
      throw err;
    }
  }, []);

  const execute = useCallback(
    async (intent: VehicleOffboardIntent): Promise<VehicleOffboardHttpResponse> => runHttp(intent),
    [runHttp],
  );

  const retryAfterMfa = useCallback(async (): Promise<VehicleOffboardHttpResponse | null> => {
    const intent =
      state.phase === 'mfa_required'
        ? state.intent
        : pendingIntentRef.current;
    if (!intent) return null;
    return runHttp(intent);
  }, [runHttp, state]);

  const retryUncertain = useCallback(async (): Promise<VehicleOffboardHttpResponse | null> => {
    const intent =
      state.phase === 'uncertain'
        ? state.intent
        : pendingIntentRef.current;
    if (!intent) return null;
    return runHttp(intent);
  }, [runHttp, state]);

  const abandonPending = useCallback(() => {
    httpInFlightRef.current = false;
    pendingIntentRef.current = null;
    if (state.phase === 'mfa_required' || state.phase === 'uncertain' || state.phase === 'submitting') {
      setState({ phase: 'idle' });
    }
  }, [state.phase]);

  return {
    state,
    execute,
    retryAfterMfa,
    retryUncertain,
    abandonPending,
    clear,
    isSubmitting: state.phase === 'submitting',
    pendingIntent: pendingIntentRef.current,
  };
}
