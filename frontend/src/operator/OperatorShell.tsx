import { useSyncExternalStore } from 'react';
import { OperatorActionSheets } from './components/OperatorActionSheets';
import { OperatorBottomNav } from './components/OperatorBottomNav';
import { OperatorDeepLinkBridge } from './components/OperatorDeepLinkBridge';
import { OperatorConnectivityBanner } from './components/OperatorConnectivityBanner';
import { OperatorDesktopFallbackBanner } from './components/OperatorDesktopFallbackBanner';
import { OperatorConnectivityBridge } from './connectivity/OperatorConnectivityBridge';
import { OperatorProcessRouteBridge } from './components/OperatorProcessRouteBridge';
import { OperatorHandoverRefreshBridge } from './components/OperatorHandoverRefreshBridge';
import { OperatorHeader } from './components/OperatorHeader';
import { OperatorDataProvider } from './context/OperatorDataContext';
import { OperatorShellProvider, useOperatorShell } from './context/OperatorShellContext';
import { OPERATOR_LAYOUT_BREAKPOINTS } from './lib/operatorDeviceCapabilities';
import { OPERATOR_MAIN_ID, OPERATOR_SKIP_LINK_ID } from './lib/operatorA11y';
import { useOperatorDeviceCapabilities } from './hooks/useOperatorDeviceCapabilities';
import { OperatorMoreView } from './views/OperatorMoreView';
import { OperatorScanView } from './views/OperatorScanView';
import { OperatorTasksView } from './views/OperatorTasksView';
import { OperatorTodayView } from './views/OperatorTodayView';
import { OperatorVehiclesView } from './views/OperatorVehiclesView';
import { FleetProvider } from '../rental/FleetContext';
import { OperatorHandoverProvider } from './handover/OperatorHandoverProvider';
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
  const capabilities = useOperatorDeviceCapabilities();
  const desktopFallback = capabilities.preferCompactShell;

  const shell = (
    <>
      <OperatorHandoverRefreshBridge />
      <OperatorDeepLinkBridge />
      <OperatorProcessRouteBridge />
      <OperatorConnectivityBridge />
      <OperatorConnectivityBanner />
      {desktopFallback && <OperatorDesktopFallbackBanner />}
      <a
        id={OPERATOR_SKIP_LINK_ID}
        href={`#${OPERATOR_MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Zum Inhalt springen
      </a>
      <OperatorHeader />
      <main
        id={OPERATOR_MAIN_ID}
        tabIndex={-1}
        className={`mx-auto flex w-full flex-1 flex-col overflow-hidden px-4 pt-4 focus:outline-none ${
          desktopFallback ? '' : 'max-w-lg md:max-w-none md:px-6'
        }`}
        style={{
          paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <OperatorTabContent />
      </main>
      <OperatorBottomNav />
      <OperatorActionSheets />
    </>
  );

  if (desktopFallback) {
    return (
      <div className="min-h-[100dvh] bg-muted/30">
        <div
          className="mx-auto flex min-h-[100dvh] w-full flex-col border-x border-border/50 bg-background text-foreground shadow-lg"
          style={{ maxWidth: `${OPERATOR_LAYOUT_BREAKPOINTS.desktopFallbackShellMax}px` }}
        >
          {shell}
        </div>
      </div>
    );
  }

  return <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">{shell}</div>;
}

export function OperatorShell() {
  const isDarkMode = useSystemDarkMode();

  return (
    <OperatorShellProvider>
      <OperatorDamageCaptureProvider>
        <OperatorHandoverProvider isDarkMode={isDarkMode}>
          <FleetProvider>
            <OperatorDataProvider>
              <OperatorShellInner />
            </OperatorDataProvider>
          </FleetProvider>
        </OperatorHandoverProvider>
      </OperatorDamageCaptureProvider>
    </OperatorShellProvider>
  );
}
