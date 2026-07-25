import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import {
  draftPayloadToFormState,
  formStateToDraftPayload,
  type HandoverDraftApiRecord,
} from './operatorHandoverDraft.types';
import type { OperatorHandoverFormState, OperatorHandoverStepId } from './operatorHandoverPayload';

const AUTOSAVE_MS = 800;

export function useOperatorHandoverDraft(
  isOpen: boolean,
  orgId: string,
  bookingId: string | undefined,
  kind: HandoverDialogKind,
  step: OperatorHandoverStepId,
  formState: OperatorHandoverFormState,
  patchState: (patch: Partial<OperatorHandoverFormState>) => void,
  setStep: (step: OperatorHandoverStepId) => void,
) {
  const [draftMeta, setDraftMeta] = useState<HandoverDraftApiRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(false);

  const loadOrCreate = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setLoading(true);
    setSyncError(null);
    try {
      const view = await api.bookings.getHandoverDraft(orgId, bookingId, kind);
      if (view.draft && !view.draft.expired && view.draft.editable) {
        setDraftMeta(view.draft);
        if (view.draft.draft) {
          skipNextSaveRef.current = true;
          patchState(draftPayloadToFormState(view.draft.draft, kind));
          if (view.draft.currentStep) {
            setStep(view.draft.currentStep);
          }
        }
        hydratedRef.current = true;
        return;
      }
      const created = await api.bookings.createHandoverDraft(orgId, bookingId, kind, {
        currentStep: 'vehicle',
      });
      setDraftMeta(created);
      hydratedRef.current = true;
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      setSyncError(e?.data?.message ?? e?.message ?? 'Entwurf konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [orgId, bookingId, kind, patchState, setStep]);

  useEffect(() => {
    if (!isOpen || !bookingId) {
      hydratedRef.current = false;
      setDraftMeta(null);
      return;
    }
    void loadOrCreate();
  }, [isOpen, bookingId, kind, loadOrCreate]);

  const persistDraft = useCallback(async () => {
    if (!orgId || !bookingId || !draftMeta?.editable || !hydratedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      const payload = formStateToDraftPayload(formState, step);
      const updated = await api.bookings.updateHandoverDraft(orgId, bookingId, kind, {
        expectedVersion: draftMeta.version,
        currentStep: step,
        draft: payload,
      });
      setDraftMeta(updated);
      setSyncError(null);
    } catch (err: unknown) {
      const e = err as { data?: { code?: string; message?: string; currentVersion?: number } };
      if (e?.data?.code === 'HANDOVER_DRAFT_VERSION_CONFLICT' && e.data.currentVersion != null) {
        setSyncError('Entwurf wurde parallel bearbeitet — bitte neu laden.');
      } else {
        setSyncError(e?.data?.message ?? 'Autosave fehlgeschlagen');
      }
    }
  }, [orgId, bookingId, kind, draftMeta, formState, step]);

  useEffect(() => {
    if (!isOpen || !hydratedRef.current || !draftMeta?.editable) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistDraft();
    }, AUTOSAVE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isOpen, formState, step, draftMeta?.editable, persistDraft]);

  return {
    draftMeta,
    draftLoading: loading,
    draftSyncError: syncError,
    sessionId: draftMeta?.id ?? null,
    expectedVersion: draftMeta?.version ?? null,
    reloadDraft: loadOrCreate,
  };
}
