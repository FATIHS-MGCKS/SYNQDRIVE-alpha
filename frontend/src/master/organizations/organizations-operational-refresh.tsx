import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

type OperationalRefreshFn = () => Promise<void>;

const OrganizationsOperationalRefreshContext = createContext<{
  registerOperationalRefresh: (fn: OperationalRefreshFn | null) => void;
  refreshOperationalList: () => Promise<void>;
} | null>(null);

export function OrganizationsOperationalRefreshProvider({ children }: { children: ReactNode }) {
  const refreshRef = useRef<OperationalRefreshFn | null>(null);

  const registerOperationalRefresh = useCallback((fn: OperationalRefreshFn | null) => {
    refreshRef.current = fn;
  }, []);

  const refreshOperationalList = useCallback(async () => {
    if (!refreshRef.current) return;
    await refreshRef.current();
  }, []);

  const value = useMemo(
    () => ({ registerOperationalRefresh, refreshOperationalList }),
    [registerOperationalRefresh, refreshOperationalList],
  );

  return (
    <OrganizationsOperationalRefreshContext.Provider value={value}>
      {children}
    </OrganizationsOperationalRefreshContext.Provider>
  );
}

export function useOrganizationsOperationalRefresh() {
  const ctx = useContext(OrganizationsOperationalRefreshContext);
  if (!ctx) {
    throw new Error('useOrganizationsOperationalRefresh requires OrganizationsOperationalRefreshProvider');
  }
  return ctx;
}