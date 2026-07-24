import { api } from '../../lib/api';
import type { LifecycleActionKind, LifecycleEntityKind } from './data-processing-lifecycle.types';
import { parseLifecycleApiError } from './data-processing-lifecycle.errors';

export interface LifecycleActionInput {
  orgId: string;
  entityKind: LifecycleEntityKind;
  entityId: string;
  activityId?: string;
  reason?: string;
  scheduleDate?: string;
  extendValidUntil?: string;
}

export async function executeLifecycleAction(
  action: LifecycleActionKind,
  input: LifecycleActionInput,
): Promise<unknown> {
  const { orgId, entityId, activityId, reason, scheduleDate, extendValidUntil } = input;

  try {
    switch (action) {
      case 'request-review':
        if (input.entityKind === 'processing-activity') {
          return api.dataProcessing.review.submitActivity(orgId, entityId);
        }
        return api.dataProcessing.lifecycle.submitForReview(orgId, entityId);

      case 'request-changes':
        if (!activityId) throw new Error('activityId required');
        return api.dataProcessing.review.recordDecision(orgId, entityId, {
          stepType: 'FINAL_APPROVAL',
          outcome: 'REQUESTED_CHANGES',
          reason,
        });

      case 'approve':
        if (input.entityKind === 'processing-activity') {
          return api.dataProcessing.lifecycle.approveActivity(orgId, entityId);
        }
        if (input.entityKind === 'legacy-authorization') {
          return api.dataAuthorizations.grant(orgId, entityId);
        }
        throw new Error(`approve not supported for ${input.entityKind}`);

      case 'schedule-activation':
        if (!scheduleDate) throw new Error('scheduleDate required');
        return api.dataProcessing.lifecycle.scheduleActivity(orgId, entityId, scheduleDate);

      case 'activate':
        if (input.entityKind === 'processing-activity') {
          return api.dataProcessing.lifecycle.activateActivity(orgId, entityId);
        }
        if (input.entityKind === 'provider-grant') {
          return api.dataProcessing.lifecycle.activateProviderGrant(orgId, entityId);
        }
        throw new Error(`activate not supported for ${input.entityKind}`);

      case 'suspend':
        if (!reason) throw new Error('reason required');
        return api.dataProcessing.lifecycle.suspendActivity(orgId, entityId, reason);

      case 'revoke':
        if (!reason) throw new Error('reason required');
        if (input.entityKind === 'processing-activity') {
          return api.dataProcessing.lifecycle.revokeActivity(orgId, entityId, reason);
        }
        if (input.entityKind === 'provider-grant') {
          return api.dataProcessing.lifecycle.revokeProviderGrant(orgId, entityId, reason);
        }
        if (input.entityKind === 'sharing' && activityId) {
          return api.dataProcessing.lifecycle.revokeSharing(orgId, activityId, entityId, reason);
        }
        if (input.entityKind === 'legacy-authorization') {
          return api.dataAuthorizations.revoke(orgId, entityId, reason);
        }
        throw new Error(`revoke not supported for ${input.entityKind}`);

      case 'reject':
        if (!reason) throw new Error('reason required');
        if (input.entityKind === 'processing-activity') {
          return api.dataProcessing.lifecycle.rejectActivity(orgId, entityId, reason);
        }
        if (input.entityKind === 'legacy-authorization') {
          return api.dataAuthorizations.revoke(orgId, entityId, reason);
        }
        throw new Error(`reject not supported for ${input.entityKind}`);

      case 'supersede':
        if (input.entityKind === 'processing-activity') {
          if (!extendValidUntil) throw new Error('extendValidUntil required');
          return api.dataProcessing.lifecycle.extendActivity(orgId, entityId, {
            validUntil: extendValidUntil,
          });
        }
        if (input.entityKind === 'dpa') {
          return api.dataProcessing.lifecycle.createDpaVersion(orgId, entityId);
        }
        throw new Error(`supersede not supported for ${input.entityKind}`);

      case 'resume':
        return api.dataProcessing.lifecycle.resumeActivity(orgId, entityId, reason);

      case 'grant':
        if (!activityId) throw new Error('activityId required');
        return api.dataProcessing.lifecycle.grantConsent(orgId, activityId, entityId);

      case 'withdraw':
        if (!activityId || !reason) throw new Error('activityId and reason required');
        return api.dataProcessing.lifecycle.withdrawConsent(orgId, activityId, entityId, reason);

      case 'authorize':
        if (!activityId) throw new Error('activityId required');
        return api.dataProcessing.lifecycle.authorizeSharing(orgId, activityId, entityId);

      case 'terminate':
        if (!reason) throw new Error('reason required');
        return api.dataProcessing.lifecycle.terminateDpa(orgId, entityId, reason);

      case 'activate-dpa':
        return api.dataProcessing.lifecycle.activateDpa(orgId, entityId);

      default:
        throw new Error(`Unknown lifecycle action: ${action}`);
    }
  } catch (error) {
    const parsed = parseLifecycleApiError(error);
    throw new Error(parsed.code ? `[${parsed.code}] ${parsed.message}` : parsed.message);
  }
}
