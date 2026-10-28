import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MasterView } from '../navigation/master-nav.types';
import {
  MasterIntelligenceReactContext,
  type MasterIntelligenceContextValue,
} from './master-intelligence-context-core';
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

function readContextFromLocation(): MasterIntelligenceContextState {
  if (typeof window === 'undefined') return EMPTY_MASTER_INTELLIGENCE_CONTEXT;
  return parseMasterIntelligenceContext(window.location.search);
}

export function MasterIntelligenceContextProvider({
  view,
  children,
}: {
  view: MasterView;
  children: ReactNode;
}) {
  const [context, setContext] = useState<MasterIntelligenceContextState>(readContextFromLocation);

  useEffect(() => {
    const onPopState = () => setContext(readContextFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateCrossLink = useCallback(
    (
      target: MasterIntelligenceCrossLinkTarget,
      patch?: Partial<MasterIntelligenceContextState>,
      opts?: { replace?: boolean },
    ) => {
      const merged = mergeMasterIntelligenceContext(context, patch ?? {});
      navigateMasterIntelligenceCrossLink(target, merged, opts);
      setContext(readContextFromLocation());
    },
    [context],
  );

  const setContextInUrl = useCallback(
    (patch: Partial<MasterIntelligenceContextState>, opts?: { replace?: boolean }) => {
      const merged = mergeMasterIntelligenceContext(context, patch);
      pushMasterIntelligenceUrl(view, merged, opts);
      setContext(readContextFromLocation());
    },
    [context, view],
  );

  const value = useMemo<MasterIntelligenceContextValue>(
    () => ({ view, context, navigateCrossLink, setContextInUrl }),
    [view, context, navigateCrossLink, setContextInUrl],
  );

  return (
    <MasterIntelligenceReactContext.Provider value={value}>{children}</MasterIntelligenceReactContext.Provider>
  );
}
