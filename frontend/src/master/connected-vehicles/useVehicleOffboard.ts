import { useCallback, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { VehicleOffboardRequestError } from './vehicle-offboard.api-error';
import { offboardIntentsMatch } from './offboard-pending-intent';
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

function isUnresolvedPendingPhase(phase: OffboardExecutionState['phase']): boolean {
  return phase === 'mfa_required' || phase === 'uncertain' || phase === 'submitting';
}

function staleResponseError(): VehicleOffboardRequestError {
  return new VehicleOffboardRequestError('Offboard response ignored (stale)', {
    kind: 'HTTP_REJECTION',
    code: 'OFFBOARD_STALE_RESPONSE',
    status: 0,
  });
}

export function useVehicleOffboard() {
  const [state, setState] = useState<OffboardExecutionState>({ phase: 'idle' });
  const httpInFlightRef = useRef(false);
  const pendingIntentRef = useRef<VehicleOffboardIntent | null>(null);
  const requestGenerationRef = useRef(0);

  const ownsGeneration = (generation: number) => generation === requestGenerationRef.current;

  const clear = useCallback(() => {
    requestGenerationRef.current += 1;
    httpInFlightRef.current = false;
    pendingIntentRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  const assertResolvableIntent = useCallback(
    (intent: VehicleOffboardIntent) => {
      const pending = pendingIntentRef.current;
      if (!pending) return;
      if (offboardIntentsMatch(pending, intent)) return;
      if (isUnresolvedPendingPhase(state.phase)) {
        throw new VehicleOffboardRequestError('Offboard intent conflict while operation pending', {
          kind: 'HTTP_REJECTION',
          code: 'OFFBOARD_PENDING_INTENT_CONFLICT',
          status: 409,
        });
      }
    },
    [state.phase],
  );

  const runHttp = useCallback(
    async (intent: VehicleOffboardIntent): Promise<VehicleOffboardHttpResponse> => {
      assertResolvableIntent(intent);
      if (httpInFlightRef.current) {
        throw new VehicleOffboardRequestError('Offboard HTTP request already in flight', {
          kind: 'HTTP_REJECTION',
          code: 'OFFBOARD_HTTP_IN_FLIGHT',
          status: 0,
        });
      }
      const generation = ++requestGenerationRef.current;
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
        if (!ownsGeneration(generation)) {
          throw staleResponseError();
        }
        const result: VehicleOffboardHttpResponse = {
          ...raw,
          warnings: raw.warnings as VehicleOffboardHttpResponse['warnings'],
        };
        httpInFlightRef.current = false;
        setState({ phase: 'success', result });
        return result;
      } catch (err) {
        if (!ownsGeneration(generation)) {
          throw staleResponseError();
        }
        httpInFlightRef.current = false;
        if (err instanceof VehicleOffboardRequestError) {
          if (err.code === 'OFFBOARD_STALE_RESPONSE') {
            throw err;
          }
          if (err.kind === 'STEP_UP_REQUIRED') {
            setState({ phase: 'mfa_required', intent });
            throw err;
          }
          if (err.kind === 'TRANSPORT_UNCERTAIN') {
            setState({
              phase: 'uncertain',
              intent,
              message: err.message,
            });
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
        pendingIntentRef.current = null;
        setState({ phase: 'idle' });
        throw err;
      }
    },
    [assertResolvableIntent],
  );

  const execute = useCallback(
    async (intent: VehicleOffboardIntent): Promise<VehicleOffboardHttpResponse> => runHttp(intent),
    [runHttp],
  );

  const retryAfterMfa = useCallback(async (): Promise<VehicleOffboardHttpResponse | null> => {
    const intent =
      state.phase === 'mfa_required' ? state.intent : pendingIntentRef.current;
    if (!intent) return null;
    return runHttp(intent);
  }, [runHttp, state]);

  const retryUncertain = useCallback(async (): Promise<VehicleOffboardHttpResponse | null> => {
    const intent = state.phase === 'uncertain' ? state.intent : pendingIntentRef.current;
    if (!intent) return null;
    return runHttp(intent);
  }, [runHttp, state]);

  const abandonPending = useCallback(() => {
    requestGenerationRef.current += 1;
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
