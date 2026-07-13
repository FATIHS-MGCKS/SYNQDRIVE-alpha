import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import type { OperatorSheetAction, OperatorSyncState, OperatorTab } from '../lib/operatorTypes';
import { OPERATOR_TABS } from '../lib/operatorTypes';
import { resolveOperatorDeepLink } from '../lib/operatorRoutes';

function parseTab(value: string | null): OperatorTab | null {
  if (value && (OPERATOR_TABS as string[]).includes(value)) return value as OperatorTab;
  return null;
}

interface OperatorShellContextValue {
  activeTab: OperatorTab;
  setActiveTab: (tab: OperatorTab) => void;
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  focusedBookingId: string | null;
  setFocusedBookingId: (id: string | null) => void;
  pendingTasksBookingId: string | null;
  setPendingTasksBookingId: (id: string | null) => void;
  scanQuery: string;
  setScanQuery: (q: string) => void;
  sheetAction: OperatorSheetAction | null;
  openSheet: (action: OperatorSheetAction) => void;
  closeSheet: () => void;
  syncState: OperatorSyncState;
  setSyncState: (patch: Partial<OperatorSyncState>) => void;
  refreshToken: number;
  triggerRefresh: () => void;
}

const OperatorShellCtx = createContext<OperatorShellContextValue | null>(null);

export function OperatorShellProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const params = useParams();

  const deepLink = resolveOperatorDeepLink(
    typeof window !== 'undefined' ? window.location.pathname : '/operator',
    searchParams,
    { vehicleId: params.vehicleId, bookingId: params.bookingId },
  );

  const initialTab =
    deepLink?.type === 'tab'
      ? deepLink.tab
      : deepLink?.type === 'vehicle' || deepLink?.type === 'booking' || deepLink?.type === 'scan'
        ? 'scan'
        : parseTab(searchParams.get('tab')) ?? 'today';

  const initialQuery =
    deepLink?.type === 'scan' ? deepLink.query : (searchParams.get('q') ?? '');

  const initialVehicleId =
    deepLink?.type === 'vehicle'
      ? deepLink.vehicleId
      : (searchParams.get('vehicleId') ?? params.vehicleId ?? null);

  const initialBookingId =
    deepLink?.type === 'booking'
      ? deepLink.bookingId
      : (searchParams.get('bookingId') ?? params.bookingId ?? null);

  const [activeTab, setActiveTabState] = useState<OperatorTab>(initialTab);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(initialVehicleId);
  const [focusedBookingId, setFocusedBookingId] = useState<string | null>(initialBookingId);
  const [pendingTasksBookingId, setPendingTasksBookingId] = useState<string | null>(null);
  const [scanQuery, setScanQuery] = useState(initialQuery);
  const [sheetAction, setSheetAction] = useState<OperatorSheetAction | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [syncState, setSyncStateInner] = useState<OperatorSyncState>({
    loading: false,
    lastSyncAt: null,
    error: false,
  });

  const setActiveTab = useCallback((tab: OperatorTab) => {
    setActiveTabState(tab);
  }, []);

  const setSyncState = useCallback((patch: Partial<OperatorSyncState>) => {
    setSyncStateInner((prev) => ({ ...prev, ...patch }));
  }, []);

  const openSheet = useCallback((action: OperatorSheetAction) => {
    setSheetAction(action);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetAction(null);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      selectedVehicleId,
      setSelectedVehicleId,
      focusedBookingId,
      setFocusedBookingId,
      pendingTasksBookingId,
      setPendingTasksBookingId,
      scanQuery,
      setScanQuery,
      sheetAction,
      openSheet,
      closeSheet,
      syncState,
      setSyncState,
      refreshToken,
      triggerRefresh,
    }),
    [
      activeTab,
      selectedVehicleId,
      focusedBookingId,
      pendingTasksBookingId,
      scanQuery,
      sheetAction,
      syncState,
      refreshToken,
      setActiveTab,
      openSheet,
      closeSheet,
      setSyncState,
      triggerRefresh,
    ],
  );

  return <OperatorShellCtx.Provider value={value}>{children}</OperatorShellCtx.Provider>;
}

export function useOperatorShell(): OperatorShellContextValue {
  const ctx = useContext(OperatorShellCtx);
  if (!ctx) throw new Error('useOperatorShell must be used within OperatorShellProvider');
  return ctx;
}
