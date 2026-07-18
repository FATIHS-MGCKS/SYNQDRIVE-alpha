import { X } from 'lucide-react';
import { EmptyState, ErrorState } from '../../../../components/patterns/states';
import { VoiceResponsiveTabs } from '../../../../components/voice-ui';
import type {
  VoiceControlPlaneAuditEventRow,
  VoiceControlPlaneOrgWorkspace,
  VoiceControlPlaneWebhookEventRow,
} from '../../../../lib/api';
import { VoiceOrgAgentTab } from './VoiceOrgAgentTab';
import { VoiceOrgAuditTab } from './VoiceOrgAuditTab';
import { VoiceOrgBillingTab } from './VoiceOrgBillingTab';
import { VoiceOrgConversationsTab } from './VoiceOrgConversationsTab';
import { VoiceOrgEventsTab } from './VoiceOrgEventsTab';
import { VoiceOrgOverviewTab } from './VoiceOrgOverviewTab';
import { VoiceOrgPhoneNumbersTab } from './VoiceOrgPhoneNumbersTab';
import { VoiceOrgProvisioningTab } from './VoiceOrgProvisioningTab';
import type { VoiceProvisioningStepView } from './voice-org-provisioning.ops';
import {
  VOICE_ORG_WORKSPACE_TABS,
  type VoiceOrgWorkspaceTab,
} from './voice-org-workspace-navigation';
import {
  filterOrgAuditEvents,
  filterOrgWebhookEvents,
} from './voice-org-workspace.ops';

interface VoiceOrgWorkspaceProps {
  open: boolean;
  orgId: string | null;
  orgName: string;
  activeTab: VoiceOrgWorkspaceTab;
  onTabChange: (tab: VoiceOrgWorkspaceTab) => void;
  onClose: () => void;
  workspace: VoiceControlPlaneOrgWorkspace | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  webhookEvents: VoiceControlPlaneWebhookEventRow[];
  auditEvents: VoiceControlPlaneAuditEventRow[];
  onRefresh: () => Promise<void>;
  onRefreshProvisioning: () => void;
  onReconnectNumber: (phoneNumberId: string) => void;
  onPublishAgent: () => void;
  onRollbackAgent: () => void;
  onReplayWebhook: (eventId: string) => void;
  onSuspend: () => void;
  onProvisioningStepAction: (step: VoiceProvisioningStepView) => void;
}

export function VoiceOrgWorkspace({
  open,
  orgId,
  orgName,
  activeTab,
  onTabChange,
  onClose,
  workspace,
  workspaceLoading,
  workspaceError,
  webhookEvents,
  auditEvents,
  onRefresh,
  onRefreshProvisioning,
  onReconnectNumber,
  onPublishAgent,
  onRollbackAgent,
  onReplayWebhook,
  onSuspend,
  onProvisioningStepAction,
}: VoiceOrgWorkspaceProps) {
  if (!open || !orgId) return null;

  const orgWebhooks = filterOrgWebhookEvents(webhookEvents, orgId);
  const orgAudit = filterOrgAuditEvents(auditEvents, orgId);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Voice Workspace ${orgName}`}
      data-testid="voice-org-workspace"
    >
      <div className="flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Voice Operations Workspace
            </p>
            <h2 className="truncate text-lg font-semibold">{orgName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted"
            aria-label="Workspace schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-border px-4 sm:px-6 py-2">
          <VoiceResponsiveTabs
            items={VOICE_ORG_WORKSPACE_TABS.map(tab => ({ key: tab.id, label: tab.label }))}
            activeKey={activeTab}
            onChange={key => onTabChange(key as VoiceOrgWorkspaceTab)}
            ariaLabel="Organisations-Workspace"
            variant="tabs"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {workspaceLoading && !workspace && (
            <div className="p-6 text-xs text-muted-foreground">Lade Workspace…</div>
          )}

          {workspaceError && !workspace && (
            <ErrorState
              title="Workspace konnte nicht geladen werden"
              description={workspaceError}
              onRetry={() => void onRefresh()}
            />
          )}

          {workspace && (
            <>
              {activeTab === 'overview' && (
                <VoiceOrgOverviewTab
                  orgId={orgId}
                  workspace={workspace}
                  onRefresh={() => void onRefresh()}
                />
              )}
              {activeTab === 'provisioning' && (
                <VoiceOrgProvisioningTab
                  workspace={workspace}
                  onStepAction={onProvisioningStepAction}
                  onRefreshProvisioning={onRefreshProvisioning}
                />
              )}
              {activeTab === 'phone-numbers' && (
                <VoiceOrgPhoneNumbersTab
                  workspace={workspace}
                  onReconnect={onReconnectNumber}
                />
              )}
              {activeTab === 'agent' && (
                <VoiceOrgAgentTab
                  workspace={workspace}
                  onPublish={onPublishAgent}
                  onRollback={onRollbackAgent}
                />
              )}
              {activeTab === 'conversations' && (
                <VoiceOrgConversationsTab
                  conversations={workspace.detail.recentConversations ?? []}
                />
              )}
              {activeTab === 'billing' && <VoiceOrgBillingTab workspace={workspace} />}
              {activeTab === 'events' && (
                <VoiceOrgEventsTab events={orgWebhooks} onReplay={onReplayWebhook} />
              )}
              {activeTab === 'audit' && (
                <VoiceOrgAuditTab
                  auditEvents={orgAudit}
                  protectionAudit={workspace.protectionAudit}
                />
              )}
            </>
          )}

          {!workspaceLoading && !workspace && !workspaceError && (
            <EmptyState title="Kein Workspace" description="Daten konnten nicht geladen werden." />
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSuspend}
              className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              Voice-Dienste sperren
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Keine vollständigen Transkripte, Secrets oder rohen Provider-Payloads.
          </p>
        </footer>
      </div>
    </div>
  );
}
