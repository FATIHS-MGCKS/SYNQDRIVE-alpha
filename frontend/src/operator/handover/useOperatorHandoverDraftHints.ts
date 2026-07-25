import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { OperatorHandoverStepId } from './operatorHandoverPayload';
import {
  dispatchHandoverDraftEvent,
  HANDOVER_DRAFT_STEP_LABELS,
} from './operatorHandoverDraftSync';
import {
  draftBufferKey,
  listOperatorHandoverDraftBuffers,
  type OperatorHandoverDraftBufferEntry,
} from './operatorHandoverDraftBuffer';

export interface OperatorHandoverDraftHint {
  bookingId: string;
  kind: HandoverDialogKind;
  currentStep: OperatorHandoverStepId;
  stepLabel: string;
  source: 'server' | 'buffer';
}

interface DraftLookupTarget {
  bookingId: string;
  kind: HandoverDialogKind;
}

function hintKey(bookingId: string, kind: HandoverDialogKind): string {
  return `${bookingId}:${kind}`;
}

async function fetchDraftHint(
  orgId: string,
  bookingId: string,
  kind: HandoverDialogKind,
): Promise<OperatorHandoverDraftHint | null> {
  const view = await api.bookings.getHandoverDraft(orgId, bookingId, kind);
  const draft = view.draft;
  if (!draft || draft.expired || !draft.editable) return null;
  const step = (draft.currentStep ?? 'vehicle') as OperatorHandoverStepId;
  return {
    bookingId,
    kind,
    currentStep: step,
    stepLabel: HANDOVER_DRAFT_STEP_LABELS[step] ?? step,
    source: 'server',
  };
}

function bufferToHint(entry: OperatorHandoverDraftBufferEntry): OperatorHandoverDraftHint {
  return {
    bookingId: entry.bookingId,
    kind: entry.kind,
    currentStep: entry.step,
    stepLabel: HANDOVER_DRAFT_STEP_LABELS[entry.step] ?? entry.step,
    source: 'buffer',
  };
}

export function useOperatorHandoverDraftHints(
  orgId: string | undefined,
  targets: DraftLookupTarget[],
): Map<string, OperatorHandoverDraftHint> {
  const [hints, setHints] = useState<Map<string, OperatorHandoverDraftHint>>(new Map());
  const targetsKey = useMemo(
    () => targets.map((t) => hintKey(t.bookingId, t.kind)).sort().join('|'),
    [targets],
  );
  const inflightRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!orgId || targets.length === 0) {
      setHints(new Map());
      return;
    }

    const seq = ++inflightRef.current;
    const next = new Map<string, OperatorHandoverDraftHint>();

    for (const entry of listOperatorHandoverDraftBuffers(orgId)) {
      const key = hintKey(entry.bookingId, entry.kind);
      if (targets.some((t) => hintKey(t.bookingId, t.kind) === key)) {
        next.set(key, bufferToHint(entry));
      }
    }

    const results = await Promise.allSettled(
      targets.map((t) => fetchDraftHint(orgId, t.bookingId, t.kind)),
    );

    if (seq !== inflightRef.current) return;

    for (let i = 0; i < targets.length; i += 1) {
      const result = results[i];
      const target = targets[i];
      const key = hintKey(target.bookingId, target.kind);
      if (result.status === 'fulfilled' && result.value) {
        next.set(key, result.value);
      } else if (!next.has(key)) {
        next.delete(key);
      }
    }

    setHints(next);
  }, [orgId, targets]);

  useEffect(() => {
    void refresh();
  }, [orgId, targetsKey, refresh]);

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener('handover:draft-saved', onChange);
    window.addEventListener('handover:draft-cleared', onChange);
    window.addEventListener('handover:completed', onChange);
    return () => {
      window.removeEventListener('handover:draft-saved', onChange);
      window.removeEventListener('handover:draft-cleared', onChange);
      window.removeEventListener('handover:completed', onChange);
    };
  }, [refresh]);

  return hints;
}

export function getOperatorHandoverDraftHint(
  hints: Map<string, OperatorHandoverDraftHint>,
  bookingId: string,
  kind: HandoverDialogKind,
): OperatorHandoverDraftHint | undefined {
  return hints.get(hintKey(bookingId, kind));
}

export { draftBufferKey };
