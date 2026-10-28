import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MasterView } from '../navigation/master-nav.types';
import {
  mergeMasterIntelligenceContext,
  navigateMasterIntelligenceCrossLink,
  parseMasterIntelligenceContext,
  pushMasterIntelligenceUrl,
} from './master-intelligence-url';
import type {
  MasterIntelligenceContextState,
  MasterIntelligenceCrossLinkTarget,
} from './master-intelligence.types';
import { EMPTY_MASTER_INTELLIGENCE_CONTEXT } from './master-intelligence.types';

type MasterIntelligenceContextValue = {
  view: MasterView;
  context: MasterIntelligenceContextState;
  navigateCrossLink: (
    target: MasterIntelligenceCrossLinkTarget,
    patch?: Partial<MasterIntelligenceContextState>,
    opts?: { replace?: boolean },
  ) => void;
  setContextInUrl: (
    patch: Partial<MasterIntelligenceContextState>,
    opts?: { replace?: boolean },
  ) => void;
};

const MasterIntelligenceContext = createContext<MasterIntelligenceContextValue | null>(null);

export function MasterIntelligenceContextProvider({
  view,
  children,
}: {
  view: MasterView;
  children: ReactNode;
}) {
  const [context, setContext] = useState<MasterIntelligenceContextState>(() =>
    typeof window !== 'undefined'
      ? parseMasterIntelligenceContext(window.location.search)
      : EMPTY_MASTER_INTELLIGENCE_CONTEXT,
  );

  const syncFromUrl = useCallback(() => {
    setContext(parseMasterIntelligenceContext(window.location.search));
  }, []);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [syncFromUrl]);

  const navigateCrossLink = useCallback(
    (
      target: MasterIntelligenceCrossLinkTarget,
      patch?: Partial<MasterIntelligenceContextState>,
      opts?: { replace?: boolean },
    ) => {
      const merged = mergeMasterIntelligenceContext(context, patch ?? {});
      navigateMasterIntelligenceCrossLink(target, merged, opts);
      setContext(parseMasterIntelligenceContext(window.location.search));
    },
    [context],
  );

  const setContextInUrl = useCallback(
    (patch: Partial<MasterIntelligenceContextState>, opts?: { replace?: boolean }) => {
      const merged = mergeMasterIntelligenceContext(context, patch);
      pushMasterIntelligenceUrl(view, merged, opts);
      setContext(parseMasterIntelligenceContext(window.location.search));
    },
    [context, view],
  );

  const value = useMemo(
    () => ({ view, context, navigateCrossLink, setContextInUrl }),
    [view, context, navigateCrossLink, setContextInUrl],
  );

  return (
    <MasterIntelligenceContext.Provider value={value}>{children}</MasterIntelligenceContext.Provider>
  );
}

export function useMasterIntelligenceContext(): MasterIntelligenceContextValue {
  const ctx = useContext(MasterIntelligenceContext);
  if (!ctx) {
    throw new Error('useMasterIntelligenceContext requires MasterIntelligenceContextProvider');
  }
  return ctx;
}

export function useOptionalMasterIntelligenceContext(): MasterIntelligenceContextValue | null {
  return useContext(MasterIntelligenceContext);
}
