import { useCallback, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { isEnrollmentRequiredError, isStepUpRequiredError } from '../../lib/mfa';
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
  const inFlightRef = useRef(false);

  const clear = useCallback(() => {
    inFlightRef.current = false;
    setState({ phase: 'idle' });
  }, []);

  const execute = useCallback(async (intent: VehicleOffboardIntent): Promise<VehicleOffboardHttpResponse> => {
    if (inFlightRef.current) {
      throw new Error('OFFBOARD_IN_FLIGHT');
    }
    inFlightRef.current = true;
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
      inFlightRef.current = false;
      setState({ phase: 'success', result });
      return result;
    } catch (err) {
      if (isStepUpRequiredError(err)) {
        setState({ phase: 'mfa_required', intent });
        throw err;
      }
      if (isEnrollmentRequiredError(err)) {
        inFlightRef.current = false;
        setState({ phase: 'idle' });
        throw err;
      }
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && /network|fetch|failed/i.test(err.message));
      if (isNetwork) {
        setState({
          phase: 'uncertain',
          intent,
          message: err instanceof Error ? err.message : 'Network error',
        });
        inFlightRef.current = false;
        throw err;
      }
      inFlightRef.current = false;
      setState({ phase: 'idle' });
      throw err;
    }
  }, []);

  const retryAfterMfa = useCallback(async (): Promise<VehicleOffboardHttpResponse | null> => {
    if (state.phase !== 'mfa_required') return null;
    return execute(state.intent);
  }, [execute, state]);

  const retryUncertain = useCallback(async (): Promise<VehicleOffboardHttpResponse | null> => {
    if (state.phase !== 'uncertain') return null;
    return execute(state.intent);
  }, [execute, state]);

  const cancelMfa = useCallback(() => {
    if (state.phase === 'mfa_required' || state.phase === 'uncertain') {
      inFlightRef.current = false;
      setState({ phase: 'idle' });
    }
  }, [state.phase]);

  return {
    state,
    execute,
    retryAfterMfa,
    retryUncertain,
    cancelMfa,
    clear,
    isSubmitting: state.phase === 'submitting',
  };
}
