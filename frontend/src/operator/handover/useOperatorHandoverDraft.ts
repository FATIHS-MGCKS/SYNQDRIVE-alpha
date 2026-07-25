import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { isApiHttpError } from '../../lib/httpError';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import {
  clearOperatorHandoverDraftBuffer,
  writeOperatorHandoverDraftBuffer,
} from './operatorHandoverDraftBuffer';
import {
  draftPayloadToFormState,
  formStateToDraftPayload,
  type HandoverDraftApiRecord,
} from './operatorHandoverDraft.types';
import {
  dispatchHandoverDraftEvent,
  extractDraftConflict,
  HANDOVER_DRAFT_AUTOSAVE_MS,
  isHandoverDraftVersionConflict,
  withDraftSaveRetry,
  type HandoverDraftConflictInfo,
  type HandoverDraftSaveStatus,
} from './operatorHandoverDraftSync';
import { dispatchHandoverDraftConnectivity } from '../connectivity/operatorConnectivity.events';
import { operatorConnectivityStore } from '../connectivity/operatorConnectivityStore';
import type { OperatorHandoverFormState, OperatorHandoverStepId } from './operatorHandoverPayload';

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

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
  const [saveStatus, setSaveStatus] = useState<HandoverDraftSaveStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<HandoverDraftConflictInfo | null>(null);
  const [isOnline, setIsOnline] = useState(isBrowserOnline);

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const saveSeqRef = useRef(0);
  const draftMetaRef = useRef<HandoverDraftApiRecord | null>(null);
  const formStateRef = useRef(formState);
  const stepRef = useRef(step);
  const prevStepRef = useRef(step);
  const flushPromiseRef = useRef<Promise<boolean> | null>(null);
  const conflictRef = useRef<HandoverDraftConflictInfo | null>(null);

  formStateRef.current = formState;
  stepRef.current = step;
  draftMetaRef.current = draftMeta;
  conflictRef.current = conflict;

  const applyDraftRecord = useCallback(
    (record: HandoverDraftApiRecord, hydrateForm: boolean) => {
      setDraftMeta(record);
      draftMetaRef.current = record;
      if (hydrateForm && record.draft) {
        skipNextSaveRef.current = true;
        patchState(draftPayloadToFormState(record.draft, kind));
        if (record.currentStep) {
          setStep(record.currentStep);
        }
      }
      if (orgId && bookingId) {
        writeOperatorHandoverDraftBuffer({
          orgId,
          bookingId,
          kind,
          sessionId: record.id,
          version: record.version,
          step: record.currentStep ?? stepRef.current,
          updatedAt: Date.now(),
        });
        operatorConnectivityStore.setDraftBufferedLocally(true);
      }
    },
    [orgId, bookingId, kind, patchState, setStep],
  );

  const loadOrCreate = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setSaveStatus('loading');
    setSyncError(null);
    setConflict(null);
    try {
      const view = await api.bookings.getHandoverDraft(orgId, bookingId, kind);
      if (view.draft && !view.draft.expired && view.draft.editable) {
        applyDraftRecord(view.draft, Boolean(view.draft.draft));
        hydratedRef.current = true;
        setSaveStatus('saved');
        return;
      }
      const created = await api.bookings.createHandoverDraft(orgId, bookingId, kind, {
        currentStep: 'vehicle',
      });
      applyDraftRecord(created, false);
      hydratedRef.current = true;
      setSaveStatus('saved');
    } catch (err: unknown) {
      if (isApiHttpError(err)) {
        setSyncError(err.message);
      } else {
        const e = err as { message?: string };
        setSyncError(e?.message ?? 'Entwurf konnte nicht geladen werden');
      }
      setSaveStatus(isBrowserOnline() ? 'error' : 'offline');
      dispatchHandoverDraftConnectivity({ status: isBrowserOnline() ? 'error' : 'offline' });
    }
  }, [orgId, bookingId, kind, applyDraftRecord]);

  useEffect(() => {
    if (!isOpen || !bookingId) {
      hydratedRef.current = false;
      setDraftMeta(null);
      draftMetaRef.current = null;
      setSaveStatus('idle');
      setConflict(null);
      setSyncError(null);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveAbortRef.current?.abort();
      dispatchHandoverDraftConnectivity({ status: 'cleared' });
      return;
    }
    void loadOrCreate();
  }, [isOpen, bookingId, kind, loadOrCreate]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
    };
    const onOffline = () => {
      setIsOnline(false);
      saveAbortRef.current?.abort();
      setSaveStatus((prev) => (prev === 'saving' ? 'offline' : prev === 'saved' ? prev : 'offline'));
      dispatchHandoverDraftConnectivity({ status: 'offline' });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const runSave = useCallback(
    async (options?: { immediate?: boolean }): Promise<boolean> => {
      if (!orgId || !bookingId || !draftMetaRef.current?.editable || !hydratedRef.current) {
        return true;
      }
      if (skipNextSaveRef.current) {
        skipNextSaveRef.current = false;
        return true;
      }
      if (conflictRef.current) return false;
      if (!isBrowserOnline()) {
        setSaveStatus('offline');
        dispatchHandoverDraftConnectivity({ status: 'offline' });
        return false;
      }

      saveAbortRef.current?.abort();
      const controller = new AbortController();
      saveAbortRef.current = controller;
      const seq = ++saveSeqRef.current;

      setSaveStatus('saving');
      dispatchHandoverDraftConnectivity({ status: 'saving' });
      setSyncError(null);

      try {
        const updated = await withDraftSaveRetry(
          async () => {
            const payload = formStateToDraftPayload(formStateRef.current, stepRef.current);
            return api.bookings.updateHandoverDraft(
              orgId,
              bookingId,
              kind,
              {
                expectedVersion: draftMetaRef.current!.version,
                currentStep: stepRef.current,
                draft: payload,
              },
              { signal: controller.signal },
            );
          },
          { isOnline: isBrowserOnline },
        );

        if (controller.signal.aborted || seq !== saveSeqRef.current) return false;

        applyDraftRecord(updated, false);
        setSaveStatus('saved');
        setConflict(null);
        dispatchHandoverDraftEvent('handover:draft-saved');
        dispatchHandoverDraftConnectivity({ status: 'saved' });
        return true;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return false;
        if (seq !== saveSeqRef.current) return false;

        if (isHandoverDraftVersionConflict(err)) {
          const info = extractDraftConflict(err);
          setConflict({
            expectedVersion: draftMetaRef.current?.version ?? 0,
            serverVersion: info?.serverVersion ?? 0,
            message: info?.message ?? 'Versionskonflikt',
          });
          setSaveStatus('conflict');
          setSyncError('Entwurf wurde parallel bearbeitet.');
          return false;
        }

        if (!isBrowserOnline() || (err instanceof Error && err.message === 'offline')) {
          setSaveStatus('offline');
          setSyncError('Offline — Entwurf wird nach Verbindungsaufbau gespeichert.');
          dispatchHandoverDraftConnectivity({ status: 'offline' });
          return false;
        }

        setSaveStatus('error');
        setSyncError(isApiHttpError(err) ? err.message : 'Autosave fehlgeschlagen');
        dispatchHandoverDraftConnectivity({ status: 'error' });
        return false;
      }
    },
    [orgId, bookingId, kind, applyDraftRecord],
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const promise = runSave({ immediate: true }).finally(() => {
      flushPromiseRef.current = null;
    });
    flushPromiseRef.current = promise;
    return promise;
  }, [runSave]);

  const scheduleSave = useCallback(() => {
    if (!isOpen || !hydratedRef.current || !draftMetaRef.current?.editable || conflictRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void runSave();
    }, HANDOVER_DRAFT_AUTOSAVE_MS);
  }, [isOpen, runSave]);

  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isOpen, formState, scheduleSave]);

  useEffect(() => {
    if (!isOpen || !hydratedRef.current) return;
    if (prevStepRef.current !== step) {
      prevStepRef.current = step;
      void flushSave();
    }
  }, [step, isOpen, flushSave]);

  const resolveConflictAcceptServer = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setSaveStatus('loading');
    try {
      const view = await api.bookings.getHandoverDraft(orgId, bookingId, kind);
      if (view.draft && view.draft.editable && !view.draft.expired) {
        applyDraftRecord(view.draft, Boolean(view.draft.draft));
        setConflict(null);
        setSyncError(null);
        setSaveStatus('saved');
      } else {
        setConflict(null);
        setSaveStatus('error');
        setSyncError('Server-Entwurf ist nicht mehr bearbeitbar.');
      }
    } catch (err: unknown) {
      setSaveStatus('error');
      setSyncError(isApiHttpError(err) ? err.message : 'Server-Entwurf konnte nicht geladen werden');
    }
  }, [orgId, bookingId, kind, applyDraftRecord]);

  const resolveConflictKeepLocal = useCallback(async () => {
    if (!orgId || !bookingId || !conflict) return;
    const serverVersionSnapshot = conflict.serverVersion;
    setConflict(null);
    setSaveStatus('saving');
    try {
      const view = await api.bookings.getHandoverDraft(orgId, bookingId, kind);
      const serverVersion = view.draft?.version ?? serverVersionSnapshot;
      if (draftMetaRef.current) {
        const bumped = { ...draftMetaRef.current, version: serverVersion };
        setDraftMeta(bumped);
        draftMetaRef.current = bumped;
      }
      await flushSave();
    } catch {
      setSaveStatus('error');
      setSyncError('Konflikt konnte nicht aufgelöst werden.');
    }
  }, [orgId, bookingId, kind, conflict, flushSave]);

  const clearDraftAfterComplete = useCallback(() => {
    if (orgId && bookingId) {
      clearOperatorHandoverDraftBuffer(orgId, bookingId, kind);
    }
    dispatchHandoverDraftEvent('handover:draft-cleared');
    setDraftMeta(null);
    draftMetaRef.current = null;
    hydratedRef.current = false;
    setSaveStatus('idle');
    setConflict(null);
  }, [orgId, bookingId, kind]);

  return {
    draftMeta,
    draftLoading: saveStatus === 'loading',
    draftSyncError: syncError,
    saveStatus,
    isOnline,
    conflict,
    sessionId: draftMeta?.id ?? null,
    expectedVersion: draftMeta?.version ?? null,
    reloadDraft: loadOrCreate,
    flushSave,
    resolveConflictAcceptServer,
    resolveConflictKeepLocal,
    clearDraftAfterComplete,
  };
}
