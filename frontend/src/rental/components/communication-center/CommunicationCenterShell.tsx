import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent } from '../../../components/ui/sheet';
import { EmptyState } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  mergeCommunicationCenterState,
  readCommunicationCenterStateFromUrl,
  syncCommunicationCenterStateToUrl,
  type CommunicationCenterUrlState,
} from './communication-center-navigation';
import { CommunicationCenterHeader } from './CommunicationCenterHeader';
import { CommunicationCenterTabs } from './CommunicationCenterTabs';
import { CommunicationInboxPane } from './CommunicationInboxPane';
import { CommunicationWorkspacePane } from './CommunicationWorkspacePane';
import { CommunicationContextPane } from './CommunicationContextPane';
import type {
  CommunicationChannel,
  CommunicationMobilePane,
  CommunicationPrimaryTab,
} from './communication-center.types';

interface CommunicationCenterShellProps {
  initialState?: Partial<CommunicationCenterUrlState>;
}

export function CommunicationCenterShell({ initialState }: CommunicationCenterShellProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<CommunicationCenterUrlState>(() =>
    mergeCommunicationCenterState({
      ...readCommunicationCenterStateFromUrl(
        typeof window !== 'undefined' ? window.location.search : '',
      ),
      ...initialState,
    }),
  );
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const mobileMq = window.matchMedia('(max-width: 1023px)');
    const tabletMq = window.matchMedia('(min-width: 1024px) and (max-width: 1279px)');
    const update = () => {
      setIsMobile(mobileMq.matches);
      setIsTablet(tabletMq.matches);
    };
    update();
    mobileMq.addEventListener('change', update);
    tabletMq.addEventListener('change', update);
    return () => {
      mobileMq.removeEventListener('change', update);
      tabletMq.removeEventListener('change', update);
    };
  }, []);

  const patchState = useCallback(
    (partial: Partial<CommunicationCenterUrlState>, options?: { replace?: boolean }) => {
      setState((current) => {
        const next = { ...current, ...partial };
        syncCommunicationCenterStateToUrl(next, options);
        return next;
      });
    },
    [],
  );

  const handleTabChange = useCallback(
    (primaryTab: CommunicationPrimaryTab) => {
      patchState({ primaryTab });
    },
    [patchState],
  );

  const handleChannelChange = useCallback(
    (channel: CommunicationChannel) => {
      patchState({ channel });
    },
    [patchState],
  );

  const handleMobilePane = useCallback(
    (mobilePane: CommunicationMobilePane) => {
      patchState({ mobilePane }, { replace: true });
    },
    [patchState],
  );

  const handleOpenContext = useCallback(() => {
    handleMobilePane('context');
  }, [handleMobilePane]);

  const hasConversation = Boolean(state.selectedConversationId);
  const showContextSheet = hasConversation && (isMobile || isTablet) && state.mobilePane === 'context';

  const inboxVisible = useMemo(() => {
    if (!isMobile) return true;
    return state.mobilePane === 'inbox';
  }, [isMobile, state.mobilePane]);

  const workspaceVisible = useMemo(() => {
    if (!isMobile) return true;
    return state.mobilePane === 'conversation' || state.mobilePane === 'context';
  }, [isMobile, state.mobilePane]);

  const settingsContent = (
    <div
      data-testid="communication-settings-shell"
      className="surface-premium flex min-h-[280px] flex-1 items-center justify-center rounded-2xl border border-border/40 p-6"
    >
      <EmptyState
        compact
        title={t('communication.settings.placeholder.title')}
        description={t('communication.settings.placeholder.description')}
      />
    </div>
  );

  const inboxWorkspace = (
    <div
      data-testid="communication-inbox-workspace"
      className={cn(
        'surface-premium grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]',
        'lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]',
        hasConversation &&
          'xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(260px,320px)]',
        'h-[min(72vh,820px)] min-h-[480px]',
      )}
    >
      <div
        className={cn(
          'min-h-0 min-w-0',
          inboxVisible ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
        )}
      >
        <CommunicationInboxPane
          activeChannel={state.channel}
          onChannelChange={handleChannelChange}
        />
      </div>

      <div
        className={cn(
          'min-h-0 min-w-0 border-border/40 lg:border-x',
          workspaceVisible ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
        )}
      >
        <CommunicationWorkspacePane
          selectedConversationId={state.selectedConversationId}
          activeChannel={state.channel}
          showBack={isMobile}
          showContextAction={hasConversation && (isMobile || isTablet)}
          onBack={() => handleMobilePane('inbox')}
          onOpenContext={handleOpenContext}
        />
      </div>

      {hasConversation && !isMobile && !isTablet && (
        <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
          <CommunicationContextPane selectedConversationId={state.selectedConversationId} />
        </div>
      )}
    </div>
  );

  return (
    <div
      data-testid="communication-center-view"
      className="flex min-h-0 flex-1 flex-col"
    >
      <CommunicationCenterHeader />
      <CommunicationCenterTabs
        activeTab={state.primaryTab}
        onTabChange={handleTabChange}
        inboxContent={inboxWorkspace}
        settingsContent={settingsContent}
      />

      <Sheet open={showContextSheet} onOpenChange={(open) => !open && handleMobilePane('conversation')}>
        <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-lg">
          <CommunicationContextPane
            selectedConversationId={state.selectedConversationId}
            onClose={() => handleMobilePane('conversation')}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
