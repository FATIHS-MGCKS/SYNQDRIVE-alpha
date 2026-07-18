import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import {
  buildVoiceRouteSearch,
  parseVoiceRouteFromSearch,
  reconcileVoiceRoute,
  type VoiceOpsTab,
  type VoiceRouteState,
  type VoiceSettingsSection,
  type VoiceWizardStep,
  type VoiceWorkspaceView,
} from './voice-information-architecture';

export interface UseVoiceWorkspaceResult {
  workspace: VoiceWorkspaceView | null;
  route: VoiceRouteState;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setWizardStep: (step: VoiceWizardStep) => Promise<void>;
  setOpsTab: (tab: VoiceOpsTab, settingsSection?: VoiceSettingsSection | null) => void;
}

function readRouteFromLocation(): VoiceRouteState {
  if (typeof window === 'undefined') {
    return { wizardStep: null, opsTab: null, settingsSection: null };
  }
  return parseVoiceRouteFromSearch(window.location.search);
}

function writeRouteToLocation(route: VoiceRouteState, replace = false): void {
  if (typeof window === 'undefined') return;
  const nextSearch = buildVoiceRouteSearch(route);
  const nextUrl = `${window.location.pathname}${nextSearch}`;
  if (`${window.location.pathname}${window.location.search}` === nextUrl) return;
  if (replace) {
    window.history.replaceState({ voiceRoute: route }, '', nextUrl);
  } else {
    window.history.pushState({ voiceRoute: route }, '', nextUrl);
  }
}

export function useVoiceWorkspace(orgId: string | null): UseVoiceWorkspaceResult {
  const [workspace, setWorkspace] = useState<VoiceWorkspaceView | null>(null);
  const [route, setRoute] = useState<VoiceRouteState>(readRouteFromLocation);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  const applyWorkspace = useCallback((nextWorkspace: VoiceWorkspaceView, requested?: VoiceRouteState) => {
    const reconciled = reconcileVoiceRoute(
      nextWorkspace,
      requested ?? routeRef.current,
    );
    setWorkspace(nextWorkspace);
    setRoute(reconciled);
    writeRouteToLocation(reconciled, true);
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextWorkspace = await api.voiceAssistant.workspace(orgId);
      applyWorkspace(nextWorkspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voice workspace');
    } finally {
      setLoading(false);
    }
  }, [applyWorkspace, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onPopState = () => {
      const requested = readRouteFromLocation();
      if (!workspace) {
        setRoute(requested);
        return;
      }
      const reconciled = reconcileVoiceRoute(workspace, requested);
      setRoute(reconciled);
      if (
        reconciled.wizardStep !== requested.wizardStep ||
        reconciled.opsTab !== requested.opsTab ||
        reconciled.settingsSection !== requested.settingsSection
      ) {
        writeRouteToLocation(reconciled, true);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [workspace]);

  const setWizardStep = useCallback(
    async (step: VoiceWizardStep) => {
      if (!orgId) return;
      const nextWorkspace = await api.voiceAssistant.updateOnboardingStep(orgId, step);
      const reconciled = reconcileVoiceRoute(nextWorkspace, { wizardStep: step, opsTab: null, settingsSection: null });
      setWorkspace(nextWorkspace);
      setRoute(reconciled);
      writeRouteToLocation(reconciled);
    },
    [orgId],
  );

  const setOpsTab = useCallback(
    (tab: VoiceOpsTab, settingsSection: VoiceSettingsSection | null = null) => {
      if (!workspace) return;
      const requested: VoiceRouteState = {
        wizardStep: null,
        opsTab: tab,
        settingsSection: tab === 'settings' ? settingsSection ?? 'assistant' : null,
      };
      const reconciled = reconcileVoiceRoute(workspace, requested);
      setRoute(reconciled);
      writeRouteToLocation(reconciled);
    },
    [workspace],
  );

  return useMemo(
    () => ({
      workspace,
      route,
      loading,
      error,
      refresh,
      setWizardStep,
      setOpsTab,
    }),
    [workspace, route, loading, error, refresh, setWizardStep, setOpsTab],
  );
}
