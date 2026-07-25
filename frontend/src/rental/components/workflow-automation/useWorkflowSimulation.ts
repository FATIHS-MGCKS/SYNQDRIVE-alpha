import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import type { WorkflowExecutionPlanDto } from '../../../lib/api';
import type { WorkflowConfigFormState } from './workflow-config.types';
import { buildWorkflowPayload } from './workflow-config.utils';
import { parseApiError } from './workflow-runtime.utils';
import { shouldAcceptSimulationResponse } from './workflow-simulate.utils';
import type { WorkflowSimulationState } from './workflow-simulate.types';

const INITIAL: WorkflowSimulationState = {
  plan: null,
  loading: false,
  error: null,
  requestId: null,
  sequence: 0,
};

export function useWorkflowSimulation(orgId: string | null, workflowId: string | null) {
  const [state, setState] = useState<WorkflowSimulationState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sequenceRef.current += 1;
    setState(INITIAL);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const simulate = useCallback(
    async (form: WorkflowConfigFormState, dirty: boolean) => {
      if (!orgId || !workflowId) {
        setState((current) => ({
          ...current,
          error: 'save_first',
          plan: null,
          loading: false,
        }));
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const nextSequence = sequenceRef.current + 1;
      sequenceRef.current = nextSequence;

      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));

      try {
        const payload = buildWorkflowPayload(form, 'draft');
        const plan = await api.workflows.dryRun(
          orgId,
          workflowId,
          {
            proposedDefinition: dirty ? payload : undefined,
            sourceRevisionType: dirty ? 'draft' : 'saved',
          },
          { signal: controller.signal },
        );

        if (!shouldAcceptSimulationResponse(nextSequence, sequenceRef.current)) {
          return;
        }

        setState({
          plan,
          loading: false,
          error: null,
          requestId: plan.requestId,
          sequence: nextSequence,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (!shouldAcceptSimulationResponse(nextSequence, sequenceRef.current)) return;
        setState({
          plan: null,
          loading: false,
          error: parseApiError(error),
          requestId: null,
          sequence: nextSequence,
        });
      }
    },
    [orgId, workflowId],
  );

  return {
    ...state,
    simulate,
    reset,
  };
}

export function useWorkflowRevisionDiff(orgId: string | null, workflowId: string | null) {
  const [diff, setDiff] = useState<import('../../../lib/api').WorkflowRevisionDiffResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  const loadDiff = useCallback(
    async (form: WorkflowConfigFormState, dirty: boolean) => {
      if (!orgId || !workflowId || !dirty) {
        setDiff(null);
        setError(null);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const nextSequence = sequenceRef.current + 1;
      sequenceRef.current = nextSequence;
      setLoading(true);
      setError(null);

      try {
        const proposedDefinition = buildWorkflowPayload(form, 'draft');
        const result = await api.workflows.revisionDiff(
          orgId,
          workflowId,
          {
            proposedDefinition,
            reason: form.changeReason.trim() || undefined,
          },
          { signal: controller.signal },
        );
        if (nextSequence !== sequenceRef.current) return;
        setDiff(result);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (nextSequence !== sequenceRef.current) return;
        setDiff(null);
        setError(parseApiError(err));
      } finally {
        if (nextSequence === sequenceRef.current) {
          setLoading(false);
        }
      }
    },
    [orgId, workflowId],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return { diff, loading, error, loadDiff };
}

export type { WorkflowExecutionPlanDto };
