import { useSyncExternalStore } from 'react';
import { OperatorActionSheets } from './components/OperatorActionSheets';
import { OperatorBottomNav } from './components/OperatorBottomNav';
import { OperatorDeepLinkBridge } from './components/OperatorDeepLinkBridge';
import { OperatorConnectivityBanner } from './components/OperatorConnectivityBanner';
import { OperatorDesktopOnlyNotice } from './components/OperatorDesktopOnlyNotice';
import { OperatorHandoverRefreshBridge } from './components/OperatorHandoverRefreshBridge';
import { OperatorHeader } from './components/OperatorHeader';
import { OperatorDataProvider } from './context/OperatorDataContext';
import { OperatorShellProvider, useOperatorShell } from './context/OperatorShellContext';
import { useIsOperatorDevice } from './hooks/useIsOperatorDevice';
import { OperatorMoreView } from './views/OperatorMoreView';
import { OperatorScanView } from './views/OperatorScanView';
import { OperatorTasksView } from './views/OperatorTasksView';
import { OperatorTodayView } from './views/OperatorTodayView';
import { OperatorVehiclesView } from './views/OperatorVehiclesView';
import { FleetProvider } from '../rental/FleetContext';
import { OperatorHandoverProvider } from './handover/OperatorHandoverProvider';
import { SendDocumentsEmailLauncherProvider } from '../rental/components/send-documents-email/SendDocumentsEmailLauncherProvider';
import { OperatorDamageCaptureProvider } from './damages/OperatorDamageCaptureProvider';

function useSystemDarkMode(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const el = document.documentElement;
      const obs = new MutationObserver(onStoreChange);
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

function OperatorTabContent() {
  const { activeTab } = useOperatorShell();

  switch (activeTab) {
    case 'today':
      return <OperatorTodayView />;
    case 'scan':
      return <OperatorScanView />;
    case 'vehicles':
      return <OperatorVehiclesView />;
    case 'tasks':
      return <OperatorTasksView />;
    case 'more':
      return <OperatorMoreView />;
    default:
      return <OperatorTodayView />;
  }
}

function OperatorShellInner() {
  const isOperatorDevice = useIsOperatorDevice();

  if (!isOperatorDevice) {
    return <OperatorDesktopOnlyNotice />;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <OperatorHandoverRefreshBridge />
      <OperatorDeepLinkBridge />
      <OperatorConnectivityBanner />
      <OperatorHeader />
      <main
        className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden px-4 pt-4 md:max-w-none md:px-6"
        style={{
          paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <OperatorTabContent />
      </main>
      <OperatorBottomNav />
      <OperatorActionSheets />
    </div>
  );
}

export function OperatorShell() {
  const isDarkMode = useSystemDarkMode();

  return (
    <OperatorShellProvider>
      <OperatorDamageCaptureProvider>
        <OperatorHandoverProvider isDarkMode={isDarkMode}>
          <SendDocumentsEmailLauncherProvider>
          <FleetProvider>
            <OperatorDataProvider>
              <OperatorShellInner />
            </OperatorDataProvider>
          </FleetProvider>
          </SendDocumentsEmailLauncherProvider>
        </OperatorHandoverProvider>
      </OperatorDamageCaptureProvider>
    </OperatorShellProvider>
  );
}
