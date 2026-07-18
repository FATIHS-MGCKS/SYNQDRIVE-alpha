import { toast } from 'sonner';
import type { VoiceSecureActionRequest } from '../VoiceSecureActionDialog';
import { createIdempotencyKey } from '../VoiceSecureActionDialog';
import { api } from '../../../../lib/api';

export interface VoiceOrgWorkspaceActionContext {
  orgId: string;
  orgName: string;
  phoneNumberId?: string;
  webhookEventId?: string;
  onRefresh: () => Promise<void>;
}

export function buildRefreshProvisioningAction(
  ctx: VoiceOrgWorkspaceActionContext,
): VoiceSecureActionRequest {
  return {
    title: 'Provisionierungsstatus aktualisieren',
    description: `Lädt den aktuellen Workspace- und Job-Status für ${ctx.orgName} neu.`,
    confirmLabel: 'Status aktualisieren',
    requireReason: false,
    onConfirm: async () => {
      await ctx.onRefresh();
      toast.success('Provisionierungsstatus aktualisiert');
    },
  };
}

export function buildRetryTwilioSubaccountAction(
  ctx: VoiceOrgWorkspaceActionContext,
): VoiceSecureActionRequest {
  return {
    title: 'Fehlgeschlagenen Schritt erneut versuchen',
    description: `Twilio-Subaccount-Provisionierung für ${ctx.orgName} wird erneut gestartet. Idempotenz-Key wird gesetzt.`,
    confirmLabel: 'Erneut versuchen',
    tone: 'default',
    onConfirm: async reason => {
      await api.voiceAssistant.admin.provisioning.twilioProvisionSubaccount(
        ctx.orgId,
        { confirm: true, friendlyName: reason.slice(0, 40) || ctx.orgName.slice(0, 40) },
        createIdempotencyKey('retry-twilio'),
      );
      await ctx.onRefresh();
      toast.success('Twilio-Provisionierung erneut gestartet');
    },
  };
}

export function buildRetryNumberImportAction(
  ctx: VoiceOrgWorkspaceActionContext,
): VoiceSecureActionRequest {
  if (!ctx.phoneNumberId) {
    throw new Error('phoneNumberId required');
  }
  return {
    title: 'Nummer erneut zuordnen',
    description: 'ElevenLabs-Import und Agent-Zuordnung werden erneut ausgeführt.',
    confirmLabel: 'Zuordnung wiederholen',
    onConfirm: async () => {
      await api.voiceAssistant.admin.provisioning.elevenLabsImport(
        ctx.orgId,
        ctx.phoneNumberId!,
        { confirm: true },
        createIdempotencyKey('retry-import'),
      );
      await ctx.onRefresh();
      toast.success('Nummer wird neu zugeordnet');
    },
  };
}

export function buildPublishAgentAction(ctx: VoiceOrgWorkspaceActionContext): VoiceSecureActionRequest {
  return {
    title: 'Agent-Version veröffentlichen',
    description: `Der aktuelle Draft wird für ${ctx.orgName} als neue aktive Version ausgerollt.`,
    confirmLabel: 'Veröffentlichen',
    onConfirm: async () => {
      await api.voiceAssistant.admin.controlPlane.deployAgent(
        ctx.orgId,
        { confirm: true },
        createIdempotencyKey('publish-agent'),
      );
      await ctx.onRefresh();
      toast.success('Agent-Version wird veröffentlicht');
    },
  };
}

export function buildRollbackAgentAction(ctx: VoiceOrgWorkspaceActionContext): VoiceSecureActionRequest {
  return {
    title: 'Agent-Rollback (destruktiv)',
    description: `Rollback auf die zuletzt aktive Agent-Version für ${ctx.orgName}. Diese Aktion ist rückwirkend.`,
    confirmLabel: 'Rollback ausführen',
    tone: 'critical',
    onConfirm: async () => {
      await api.voiceAssistant.admin.controlPlane.rollbackAgent(ctx.orgId, { confirm: true });
      await ctx.onRefresh();
      toast.success('Rollback ausgeführt');
    },
  };
}

export function buildSuspendOrgAction(ctx: VoiceOrgWorkspaceActionContext): VoiceSecureActionRequest {
  return {
    title: 'Voice-Dienste sperren (destruktiv)',
    description: `Voice-Dienste für ${ctx.orgName} werden suspendiert. Kundenanrufe können ausfallen.`,
    confirmLabel: 'Dienste sperren',
    tone: 'critical',
    onConfirm: async reason => {
      await api.voiceAssistant.admin.controlPlane.suspendOrganization(
        ctx.orgId,
        { reason, confirm: true },
        createIdempotencyKey('suspend'),
      );
      await ctx.onRefresh();
      toast.success('Voice-Dienste gesperrt');
    },
  };
}

export function buildReplayWebhookAction(
  ctx: VoiceOrgWorkspaceActionContext,
): VoiceSecureActionRequest {
  if (!ctx.webhookEventId) {
    throw new Error('webhookEventId required');
  }
  return {
    title: 'Webhook-Ereignis erneut verarbeiten',
    description:
      'Das Ereignis wird erneut in die Verarbeitungsqueue eingestellt. Keine vollständigen Payloads werden angezeigt.',
    confirmLabel: 'Erneut verarbeiten',
    onConfirm: async reason => {
      await api.voiceAssistant.admin.controlPlane.replayWebhookEvent(
        ctx.webhookEventId!,
        { reason, confirm: true },
        createIdempotencyKey('replay-webhook'),
      );
      await ctx.onRefresh();
      toast.success('Webhook-Ereignis erneut eingestellt');
    },
  };
}
