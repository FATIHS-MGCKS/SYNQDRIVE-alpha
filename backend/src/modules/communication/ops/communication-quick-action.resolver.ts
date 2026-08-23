import { Injectable } from '@nestjs/common';
import { TaskPermissionService } from '@modules/tasks/task-permission.service';
import { WhatsAppConversationContextService } from '@modules/whatsapp/whatsapp-conversation-context.service';
import type { WhatsAppQuickActionId } from '@modules/whatsapp/whatsapp-conversation-context.types';
import { COMMUNICATION_QUICK_ACTION_CATALOG } from './communication-quick-action.catalog';
import type { CommunicationQuickActionAvailability } from './communication-quick-action.types';

@Injectable()
export class CommunicationQuickActionResolverService {
  constructor(
    private readonly contextService: WhatsAppConversationContextService,
    private readonly taskPermissions: TaskPermissionService,
  ) {}

  async listAvailableActions(
    organizationId: string,
    nativeConversationId: string,
    actorUserId: string,
  ): Promise<CommunicationQuickActionAvailability[]> {
    const context = await this.contextService.getContext(organizationId, nativeConversationId);
    const legacyById = new Map(context.quickActions.map((action) => [action.id, action]));

    const canCreateTask = await this.canCreateTask(actorUserId, organizationId);

    return (Object.keys(COMMUNICATION_QUICK_ACTION_CATALOG) as WhatsAppQuickActionId[]).map(
      (actionId) => {
        const catalog = COMMUNICATION_QUICK_ACTION_CATALOG[actionId];
        const legacy = legacyById.get(actionId);

        if (catalog.deferred) {
          return this.toAvailability(catalog, false, 'communication.quickActions.disabled.deferred');
        }

        if (catalog.requiresTaskCreate && !canCreateTask) {
          return this.toAvailability(
            catalog,
            false,
            'communication.quickActions.disabled.missingTaskPermission',
          );
        }

        const enabled = legacy?.enabled ?? false;
        const disabledReasonKey = enabled
          ? undefined
          : mapLegacyReasonToKey(legacy?.reason);

        return this.toAvailability(catalog, enabled, disabledReasonKey);
      },
    );
  }

  private toAvailability(
    catalog: (typeof COMMUNICATION_QUICK_ACTION_CATALOG)[WhatsAppQuickActionId],
    enabled: boolean,
    disabledReasonKey?: string,
  ): CommunicationQuickActionAvailability {
    return {
      id: catalog.id,
      labelKey: catalog.labelKey,
      confirmKey: catalog.confirmKey,
      enabled,
      disabledReasonKey,
      requiresConfirmation: catalog.requiresConfirmation,
      resultMode: catalog.resultMode,
    };
  }

  private async canCreateTask(actorUserId: string, organizationId: string): Promise<boolean> {
    try {
      await this.taskPermissions.assert({ id: actorUserId }, organizationId, 'tasks.create');
      return true;
    } catch {
      return false;
    }
  }
}

function mapLegacyReasonToKey(reason?: string): string | undefined {
  if (!reason) return 'communication.quickActions.disabled.unavailable';
  const normalized = reason.toLowerCase();
  if (normalized.includes('opted out')) {
    return 'communication.quickActions.disabled.customerOptedOut';
  }
  if (normalized.includes('not connected') || normalized.includes('inactive')) {
    return 'communication.quickActions.disabled.whatsappInactive';
  }
  if (normalized.includes('provider not configured')) {
    return 'communication.quickActions.disabled.providerNotConfigured';
  }
  if (normalized.includes('no booking')) {
    return 'communication.quickActions.disabled.noBooking';
  }
  if (normalized.includes('missing documents')) {
    return 'communication.quickActions.disabled.noMissingDocuments';
  }
  if (normalized.includes('station')) {
    return 'communication.quickActions.disabled.stationUnavailable';
  }
  if (normalized.includes('payment') || normalized.includes('deposit')) {
    return 'communication.quickActions.disabled.noPendingPayment';
  }
  if (normalized.includes('pending human')) {
    return 'communication.quickActions.disabled.alreadyPendingHuman';
  }
  if (normalized.includes('closed')) {
    return 'communication.quickActions.disabled.alreadyClosed';
  }
  if (normalized.includes('open')) {
    return 'communication.quickActions.disabled.alreadyOpen';
  }
  if (normalized.includes('customer or booking')) {
    return 'communication.quickActions.disabled.noCustomerOrBooking';
  }
  return 'communication.quickActions.disabled.unavailable';
}
