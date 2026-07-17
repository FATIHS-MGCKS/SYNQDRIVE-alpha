import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  AgentDeploymentReadinessItem,
  AgentDeploymentReadinessView,
  CanonicalAgentConfig,
} from './agent-config.types';
import {
  buildCanonicalElevenLabsPostCallWebhookUrl,
  isElevenLabsWebhookSecretConfigured,
} from './agent-post-call.config';
import {
  hasMandatoryEscalation,
  hasResolvableTransferTarget,
  validateTransferConfig,
} from './agent-transfer.validation';

export type AgentDeploymentReadinessOptions = {
  forDeploy?: boolean;
};

@Injectable()
export class AgentDeploymentReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    organizationId: string,
    config: CanonicalAgentConfig,
    options: AgentDeploymentReadinessOptions = {},
  ): Promise<AgentDeploymentReadinessView> {
    const blockers: AgentDeploymentReadinessItem[] = [];
    const warnings: AgentDeploymentReadinessItem[] = [];

    let resolvedTransfers: Awaited<ReturnType<typeof validateTransferConfig>> = [];
    try {
      resolvedTransfers = await validateTransferConfig(this.prisma, organizationId, config);
    } catch (err: unknown) {
      blockers.push({
        key: 'transferValidation',
        label: 'Transfer rules',
        level: 'blocker',
        message: err instanceof Error ? err.message : 'Transfer validation failed.',
      });
    }

    if (hasMandatoryEscalation(config) && !hasResolvableTransferTarget(resolvedTransfers)) {
      blockers.push({
        key: 'transferTarget',
        label: 'Escalation transfer target',
        level: 'blocker',
        message:
          'Mandatory escalation is enabled but no organization-bound transfer target resolves to a phone number.',
      });
    }

    const webhookUrl = buildCanonicalElevenLabsPostCallWebhookUrl(organizationId);
    if (!webhookUrl) {
      blockers.push({
        key: 'postCallWebhookUrl',
        label: 'Post-call webhook URL',
        level: 'blocker',
        message:
          'Public app base URL is not configured (TWILIO_VOICE_WEBHOOK_BASE_URL or APP_URL).',
      });
    }

    if (config.postCall.signatureRequired && !isElevenLabsWebhookSecretConfigured()) {
      blockers.push({
        key: 'postCallWebhookSecret',
        label: 'Post-call webhook signature',
        level: 'blocker',
        message:
          'Signed ElevenLabs webhooks require ELEVENLABS_WEBHOOK_SECRET on the server.',
      });
    }

    if (options.forDeploy) {
      const fallback = config.fallback;
      if (
        fallback?.avoidFalseSuccessStatus !== false &&
        !fallback?.standardAnnouncement?.trim() &&
        !fallback?.message?.trim()
      ) {
        blockers.push({
          key: 'fallbackAnnouncement',
          label: 'Fallback announcement',
          level: 'blocker',
          message: 'A fallback or standard announcement is required before deployment.',
        });
      }
    }

    const privacy = config.privacyRetention;
    if (!privacy.consentNoticeText?.trim()) {
      warnings.push({
        key: 'privacyConsentNotice',
        label: 'Privacy consent notice',
        level: 'warning',
        message: 'No consent or privacy notice text is configured for callers.',
      });
    }

    const retentionConfigured = Boolean(
      privacy.retentionAudioDays ||
        privacy.retentionTranscriptDays ||
        privacy.retentionSummaryDays ||
        privacy.retentionProviderPayloadDays ||
        privacy.retentionDays,
    );
    if (!retentionConfigured) {
      warnings.push({
        key: 'retentionPolicy',
        label: 'Retention policy',
        level: 'warning',
        message: 'No retention windows are configured for audio, transcript, or summary data.',
      });
    }

    if (privacy.recordAudio) {
      warnings.push({
        key: 'audioRecording',
        label: 'Audio recording',
        level: 'warning',
        message: 'Audio recording is enabled. Ensure explicit tenant consent before production use.',
      });
    }

    if (privacy.masterAdminContentAccess) {
      warnings.push({
        key: 'masterAdminContentAccess',
        label: 'Master admin content access',
        level: 'warning',
        message: 'Master admin content access is enabled for voice artifacts.',
      });
    }

    return {
      ready: blockers.length === 0,
      blockers,
      warnings,
    };
  }
}
