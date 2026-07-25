import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CHANNEL_FALLBACK_ORDER,
  isKnownLegalBasisRef,
  legalBasisAllowsPurpose,
} from './workflow-communication-policy.config';
import {
  buildCommunicationPolicySnapshot,
  snapshotsCompatible,
} from './workflow-communication-policy.snapshot';
import type {
  WorkflowCommunicationChannel,
  WorkflowCommunicationPolicyDecision,
  WorkflowCommunicationPolicyEvaluateInput,
  WorkflowCommunicationPolicyResult,
  WorkflowCommunicationReasonCode,
} from './workflow-communication-policy.types';

@Injectable()
export class WorkflowCommunicationPolicyEngineService {
  /**
   * Authoritative policy evaluation for all automated customer contacts.
   * Must be called at planning (dry-run) and immediately before provider send.
   */
  evaluate(input: WorkflowCommunicationPolicyEvaluateInput): WorkflowCommunicationPolicyResult {
    const checksApplied: string[] = [];
    const now = input.now ?? new Date();

    checksApplied.push('organizationId');
    if (input.resourceOrganizationId && input.resourceOrganizationId !== input.organizationId) {
      return this.result(input, checksApplied, 'DENY', 'TENANT_VIOLATION', {
        explanation:
          'Recipient resource belongs to a different organization — cross-tenant communication is forbidden.',
      });
    }

    if (input.specialBlockCodes?.length) {
      checksApplied.push('specialBlock');
      return this.result(input, checksApplied, 'SUPPRESS', 'SPECIAL_BLOCK', {
        explanation: `Communication blocked by special hold: ${input.specialBlockCodes.join(', ')}`,
      });
    }

    checksApplied.push('channelPermission');
    if (input.channelEnabled === false) {
      return this.result(input, checksApplied, 'DENY', 'CHANNEL_DISABLED', {
        explanation: `${input.channel} channel is not active or connected for this organization`,
      });
    }
    if (input.channelPermissionGranted === false) {
      return this.result(input, checksApplied, 'DENY', 'CHANNEL_NOT_PERMITTED', {
        explanation: `Organization lacks permission to use ${input.channel} for automated contacts`,
      });
    }

    checksApplied.push('processingPurpose');
    if (input.processingPurpose === 'marketing') {
      return this.result(input, checksApplied, 'DENY', 'MARKETING_BLOCKED', {
        explanation:
          'Marketing communications via workflow automation are disabled — use documented consent-based campaigns separately',
      });
    }

    checksApplied.push('legalBasisRef');
    if (input.requireLegalBasis && !input.legalBasisRef?.trim()) {
      return this.result(input, checksApplied, 'DENY', 'LEGAL_BASIS_MISSING', {
        explanation:
          'Legal basis reference is required — configure a documented reference in organization communication settings',
      });
    }
    if (input.legalBasisRef?.trim() && !isKnownLegalBasisRef(input.legalBasisRef)) {
      return this.result(input, checksApplied, 'DENY', 'LEGAL_BASIS_UNKNOWN', {
        explanation: `Unknown legal basis reference "${input.legalBasisRef}" — use a configured catalog code only`,
      });
    }
    if (
      input.legalBasisRef?.trim()
      && !legalBasisAllowsPurpose(input.legalBasisRef.trim(), input.processingPurpose)
    ) {
      return this.result(input, checksApplied, 'DENY', 'TRANSACTIONAL_PURPOSE_REQUIRED', {
        explanation:
          'Selected legal basis does not permit this processing purpose — marketing cannot be sent under transactional references',
      });
    }

    checksApplied.push('bookingOrContractRef');
    if (input.requireBookingOrContractRef && !input.bookingId?.trim() && !input.contractId?.trim()) {
      return this.result(input, checksApplied, 'DENY', 'BOOKING_REF_MISSING', {
        explanation:
          'Transactional workflow communication requires a booking or contract reference — hidden marketing under transactional purpose is blocked',
      });
    }

    checksApplied.push('recipientValidation');
    if (input.recipientValidated === false) {
      return this.result(input, checksApplied, 'DENY', 'RECIPIENT_NOT_VALIDATED', {
        explanation: 'Recipient phone or email must be validated before automated contact',
      });
    }

    checksApplied.push('optOut');
    if (input.optedOut) {
      if (input.channel === 'email' && input.emailSuppressed) {
        return this.result(input, checksApplied, 'SUPPRESS', 'SUPPRESSED', {
          explanation: 'Recipient is on the organization email suppression list',
        });
      }
      return this.result(input, checksApplied, 'SUPPRESS', 'OPT_OUT', {
        explanation: 'Recipient has opted out — scheduled communication must not be sent',
      });
    }

    checksApplied.push('optIn');
    if (input.requireOptIn && !input.optedIn) {
      return this.result(input, checksApplied, 'DENY', 'OPT_IN_REQUIRED', {
        explanation: 'Explicit opt-in is required for this communication purpose and channel',
      });
    }

    checksApplied.push('communicationPreference');
    const prefMismatch = this.preferenceMismatch(input);
    if (prefMismatch) {
      const fallback = input.fallbackChannel ?? CHANNEL_FALLBACK_ORDER[input.channel] ?? null;
      if (fallback) {
        return this.result(input, checksApplied, 'FALLBACK_CHANNEL', 'FALLBACK_AVAILABLE', {
          explanation: `Recipient prefers ${input.communicationPreference} — fallback to ${fallback} is available`,
          fallbackChannel: fallback,
        });
      }
      return this.result(input, checksApplied, 'DENY', 'COMMUNICATION_PREFERENCE_MISMATCH', {
        explanation: `Recipient communication preference (${input.communicationPreference}) does not allow ${input.channel}`,
      });
    }

    checksApplied.push('countryAndProvider');
    if (input.countryRestricted) {
      return this.result(input, checksApplied, 'DENY', 'COUNTRY_RESTRICTED', {
        explanation: 'Destination country is restricted for this channel',
      });
    }
    if (input.providerRestricted) {
      return this.result(input, checksApplied, 'DENY', 'PROVIDER_RESTRICTED', {
        explanation: 'Provider policy restricts this communication',
      });
    }

    if (input.suppressAfterSuccessfulContact && input.priorSuccessfulContact) {
      checksApplied.push('priorSuccessfulContact');
      return this.result(input, checksApplied, 'SUPPRESS', 'PRIOR_CONTACT_SUCCESS', {
        explanation: 'Successful contact already achieved — duplicate outreach suppressed',
      });
    }

    checksApplied.push('quietHours');
    if (
      input.enforceQuietHours
      && input.respectQuietHours !== false
      && input.inQuietHours === false
    ) {
      const delayUntil = input.quietHoursDelayUntil ?? this.defaultDelay(now);
      return this.result(input, checksApplied, 'DELAY_UNTIL', 'QUIET_HOURS', {
        explanation:
          input.quietHoursExplanation
          ?? 'Outside organization quiet hours — communication delayed until next allowed window',
        delayUntil: delayUntil.toISOString(),
      });
    }

    checksApplied.push('contactFrequency');
    if (input.contactFrequencyExceeded) {
      const delayUntil = input.contactFrequencyDelayUntil ?? new Date(now.getTime() + 60 * 60 * 1000);
      return this.result(input, checksApplied, 'DELAY_UNTIL', 'CONTACT_FREQUENCY', {
        explanation: 'Contact frequency limit reached for this recipient',
        delayUntil: delayUntil.toISOString(),
      });
    }

    checksApplied.push('rateLimit');
    if (input.rateLimitExceeded) {
      const delayUntil = input.rateLimitDelayUntil ?? new Date(now.getTime() + 15 * 60 * 1000);
      return this.result(input, checksApplied, 'DELAY_UNTIL', 'RATE_LIMIT', {
        explanation: 'Organization rate limit reached — retry after cooldown',
        delayUntil: delayUntil.toISOString(),
      });
    }

    checksApplied.push('aiTransparency');
    if (input.aiGenerated && !input.aiTransparencyProvided) {
      return this.result(input, checksApplied, 'DENY', 'AI_TRANSPARENCY_REQUIRED', {
        explanation: 'AI-generated messages require transparency disclosure before send',
      });
    }

    checksApplied.push('dataMinimization');
    checksApplied.push('retentionClass');

    if (input.phase === 'pre_send' && input.frozenSnapshot) {
      checksApplied.push('policySnapshot');
      const currentSnapshot = buildCommunicationPolicySnapshot(input, checksApplied, now);
      if (!snapshotsCompatible(input.frozenSnapshot, currentSnapshot)) {
        return this.result(input, checksApplied, 'DENY', 'POLICY_CHANGED_PRE_SEND', {
          explanation:
            'Communication policy changed since planning — re-plan required (e.g. opt-out or channel change)',
        });
      }
    }

    checksApplied.push('approval');
    if (input.requiresApproval && !input.runApproved) {
      return this.result(input, checksApplied, 'ALLOW_WITH_APPROVAL', 'APPROVAL_REQUIRED', {
        explanation: 'Communication requires workflow approval before send',
      });
    }

    return this.result(input, checksApplied, 'ALLOW', 'ALLOWED', {
      explanation: 'Communication permitted under current policy',
    });
  }

  /**
   * Provider adapters must call this immediately before send.
   * Throws when decision is not sendable — client cannot bypass.
   */
  assertSendPermitted(
    result: {
      decision: WorkflowCommunicationPolicyDecision;
      explanation?: string;
      reason?: string;
    },
    options?: { allowWithApproval?: boolean },
  ): void {
    const sendable: WorkflowCommunicationPolicyDecision[] = ['ALLOW'];
    if (options?.allowWithApproval) {
      sendable.push('ALLOW_WITH_APPROVAL');
    }

    if (sendable.includes(result.decision)) return;

    const message = result.explanation ?? result.reason ?? 'Communication policy blocked send';

    if (result.decision === 'SUPPRESS') {
      throw new ForbiddenException(message);
    }
    if (result.decision === 'DELAY_UNTIL') {
      throw new BadRequestException(message);
    }
    if (result.decision === 'FALLBACK_CHANNEL') {
      throw new BadRequestException(message);
    }
    throw new ForbiddenException(message);
  }

  private preferenceMismatch(input: WorkflowCommunicationPolicyEvaluateInput): boolean {
    if (!input.communicationPreference || input.communicationPreference === 'none') {
      return false;
    }
    return input.communicationPreference !== input.channel;
  }

  private defaultDelay(now: Date): Date {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  private result(
    input: WorkflowCommunicationPolicyEvaluateInput,
    checksApplied: string[],
    decision: WorkflowCommunicationPolicyDecision,
    reasonCode: WorkflowCommunicationReasonCode,
    extra: {
      explanation: string;
      delayUntil?: string;
      fallbackChannel?: WorkflowCommunicationChannel;
    },
  ): WorkflowCommunicationPolicyResult {
    const snapshot = buildCommunicationPolicySnapshot(input, checksApplied);
    const allowed = decision === 'ALLOW' || decision === 'ALLOW_WITH_APPROVAL';
    return {
      decision,
      reasonCode,
      explanation: extra.explanation,
      snapshot,
      delayUntil: extra.delayUntil,
      fallbackChannel: extra.fallbackChannel,
      allowed,
    };
  }
}
