import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent } from '../../../components/ui/sheet';
import { cn } from '../../../components/ui/utils';
import { useCommunicationConversation } from '../../../lib/communication/hooks/useCommunicationConversation';
import { useRentalOrg } from '../../RentalContext';
import {
  applyCommunicationChannelChange,
  applyCommunicationPrimaryTabChange,
  applyCommunicationSettingsSectionChange,
  mergeCommunicationCenterState,
  normalizeCommunicationSettingsSection,
  readCommunicationCenterStateFromUrl,
  syncCommunicationCenterStateToUrl,
  COMMUNICATION_SETTINGS_PARAM,
  type CommunicationCenterUrlState,
} from './communication-center-navigation';
import { CommunicationCenterHeader } from './CommunicationCenterHeader';
import { CommunicationInboxPane } from './CommunicationInboxPane';
import { CommunicationWorkspacePane } from './CommunicationWorkspacePane';
import { CommunicationContextPane } from './CommunicationContextPane';
import { CommunicationPrimaryTabs } from './CommunicationPrimaryTabs';
import { CommunicationSettingsPane } from './CommunicationSettingsPane';
import { conversationHasContext } from './communication-context-utils';
import {
  canAccessCommunicationSettings,
  canAccessCommunicationSettingsSection,
} from './communication-settings-permissions';
import {
  DEFAULT_COMMUNICATION_INBOX_FILTERS,
  mergeCommunicationInboxFilters,
  type CommunicationInboxFilters,
} from './communication-inbox-state';
import type {
  CommunicationChannel,
  CommunicationMobilePane,
  CommunicationPrimaryTab,
  CommunicationSettingsSection,
} from './communication-center.types';

interface CommunicationCenterShellProps {
  initialState?: Partial<CommunicationCenterUrlState>;
}

export function CommunicationCenterShell({ initialState }: CommunicationCenterShellProps) {
  const { orgId, hasPermission, userRole } = useRentalOrg();
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

  const showSettingsTab = canAccessCommunicationSettings(hasPermission, userRole);
  const inboxActive = state.primaryTab === 'inbox';
  const settingsActive = state.primaryTab === 'settings' && showSettingsTab;

  useEffect(() => {
    if (!showSettingsTab && state.primaryTab === 'settings') {
      setState((current) => {
        const next = mergeCommunicationCenterState({ ...current, primaryTab: 'inbox' });
        syncCommunicationCenterStateToUrl(next, { replace: true });
        return next;
      });
    }
  }, [showSettingsTab, state.primaryTab]);

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

  useEffect(() => {
    const onPopState = () => {
      setState(
        mergeCommunicationCenterState(readCommunicationCenterStateFromUrl(window.location.search)),
      );
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const patchState = useCallback(
    (partial: Partial<CommunicationCenterUrlState>, options?: { replace?: boolean }) => {
      setState((current) => {
        const next = mergeCommunicationCenterState({ ...current, ...partial });
        syncCommunicationCenterStateToUrl(next, options);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawSection = params.get(COMMUNICATION_SETTINGS_PARAM);
    if (!rawSection) return;
    const normalized = normalizeCommunicationSettingsSection(rawSection);
    if (rawSection !== normalized) {
      patchState({ settingsSection: normalized, primaryTab: 'settings' }, { replace: true });
    }
  }, [patchState]);

  const handlePrimaryTabChange = useCallback(
    (primaryTab: CommunicationPrimaryTab) => {
      setState((current) => {
        const next = applyCommunicationPrimaryTabChange(current, primaryTab);
        syncCommunicationCenterStateToUrl(next);
        return next;
      });
    },
    [],
  );

  const handleSettingsSectionChange = useCallback((settingsSection: CommunicationSettingsSection) => {
    setState((current) => {
      const next = applyCommunicationSettingsSectionChange(current, settingsSection);
      syncCommunicationCenterStateToUrl(next);
      return next;
    });
  }, []);

  const handleChannelChange = useCallback((channel: CommunicationChannel) => {
    setState((current) => {
      const next = applyCommunicationChannelChange(current, channel);
      syncCommunicationCenterStateToUrl(next);
      return next;
    });
  }, []);

  const handleInboxFiltersChange = useCallback((partial: Partial<CommunicationInboxFilters>) => {
    setState((current) => {
      const next = mergeCommunicationCenterState({
        ...current,
        inboxFilters: mergeCommunicationInboxFilters({ ...current.inboxFilters, ...partial }),
      });
      syncCommunicationCenterStateToUrl(next);
      return next;
    });
  }, []);

  const handleClearInboxFilters = useCallback(() => {
    patchState({
      channel: 'all',
      inboxFilters: DEFAULT_COMMUNICATION_INBOX_FILTERS,
      selectedConversationId: null,
    });
  }, [patchState]);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      patchState({
        selectedConversationId: conversationId,
        mobilePane: isMobile ? 'conversation' : state.mobilePane,
      });
    },
    [isMobile, patchState, state.mobilePane],
  );

  const handleMobilePane = useCallback(
    (mobilePane: CommunicationMobilePane) => {
      if (mobilePane === 'inbox') {
        patchState({ mobilePane, selectedConversationId: null }, { replace: true });
        return;
      }
      patchState({ mobilePane }, { replace: true });
    },
    [patchState],
  );

  const handleOpenContext = useCallback(() => {
    handleMobilePane('context');
  }, [handleMobilePane]);

  const conversationState = useCommunicationConversation({
    orgId,
    conversationId: state.selectedConversationId,
    enabled: Boolean(orgId && state.selectedConversationId && inboxActive),
  });

  const handleClearInvalidSelection = useCallback(() => {
    patchState({ selectedConversationId: null, mobilePane: 'inbox' });
  }, [patchState]);

  useEffect(() => {
    if (!inboxActive) return;
    const conversation = conversationState.conversation;
    if (!conversation || !state.selectedConversationId) return;
    const apiChannel = conversation.channel.toLowerCase();
    if (apiChannel !== 'whatsapp' && apiChannel !== 'voice' && apiChannel !== 'sms') return;
    if (state.channel !== 'all' && state.channel !== apiChannel) {
      patchState({ channel: apiChannel }, { replace: true });
    }
  }, [
    conversationState.conversation,
    inboxActive,
    patchState,
    state.channel,
    state.selectedConversationId,
  ]);

  const settingsSection = useMemo(() => {
    const normalized = normalizeCommunicationSettingsSection(state.settingsSection);
    if (!canAccessCommunicationSettingsSection(normalized, hasPermission, userRole)) {
      return 'overview';
    }
    return normalized;
  }, [hasPermission, state.settingsSection, userRole]);

  const hasConversation = Boolean(state.selectedConversationId);
  const hasContext = conversationHasContext(conversationState.conversation);
  const showContextSheet =
    inboxActive && hasConversation && (isMobile || isTablet) && state.mobilePane === 'context';

  const inboxVisible = useMemo(() => {
    if (!isMobile) return true;
    return state.mobilePane === 'inbox';
  }, [isMobile, state.mobilePane]);

  const workspaceVisible = useMemo(() => {
    if (!isMobile) return true;
    return state.mobilePane === 'conversation' || state.mobilePane === 'context';
  }, [isMobile, state.mobilePane]);

  return (
    <div data-testid="communication-center-view" className="flex min-h-0 flex-1 flex-col">
      <CommunicationCenterHeader />
      <CommunicationPrimaryTabs
        activeTab={state.primaryTab}
        showSettings={showSettingsTab}
        onChange={handlePrimaryTabChange}
      />

      {settingsActive ? (
        <div className="surface-premium min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] lg:min-h-[480px] lg:p-5">
          <CommunicationSettingsPane
            activeSection={settingsSection}
            enabled={settingsActive}
            onSectionChange={handleSettingsSectionChange}
          />
        </div>
      ) : (
        <div
          data-testid="communication-inbox-workspace"
          className={cn(
            'surface-premium grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)]',
            'max-lg:h-[min(70dvh,720px)] lg:h-[min(72vh,820px)] lg:min-h-[480px]',
            'lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]',
            hasConversation &&
              'xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(260px,320px)]',
          )}
        >
          <div
            className={cn(
              'min-h-0 min-w-0',
              inboxVisible ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
            )}
          >
            <CommunicationInboxPane
              enabled={inboxActive}
              activeChannel={state.channel}
              inboxFilters={state.inboxFilters}
              selectedConversationId={state.selectedConversationId}
              onChannelChange={handleChannelChange}
              onInboxFiltersChange={handleInboxFiltersChange}
              onSelectConversation={handleSelectConversation}
              onClearInboxFilters={handleClearInboxFilters}
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
              conversationState={conversationState}
              showBack={isMobile}
              showContextAction={hasConversation && (isMobile || isTablet)}
              hasContext={hasContext}
              onBack={() => handleMobilePane('inbox')}
              onOpenContext={handleOpenContext}
              onClearInvalidSelection={handleClearInvalidSelection}
            />
          </div>

          {hasConversation && !isMobile && !isTablet && (
            <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
              <CommunicationContextPane
                selectedConversationId={state.selectedConversationId}
                conversation={conversationState.conversation}
                loading={conversationState.detailLoading}
              />
            </div>
          )}
        </div>
      )}

      <Sheet
        open={showContextSheet}
        onOpenChange={(open) => !open && handleMobilePane('conversation')}
      >
        <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-lg">
          <CommunicationContextPane
            selectedConversationId={state.selectedConversationId}
            conversation={conversationState.conversation}
            loading={conversationState.detailLoading}
            onClose={() => handleMobilePane('conversation')}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
