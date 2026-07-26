import { NotificationEventKind, NotificationSeverity } from '../notification.enums';
import { NotificationSourceType } from '../notification.enums';
import type { NotificationEventTypeDefinition } from './notification-event-registry.types';
import { NOTIFICATION_EVENT_TYPE_DEFINITIONS } from './notification-event-registry.definitions';
import { NOTIFICATION_EVENT_TYPE_ALIASES } from './notification-event-registry.aliases';
import { NOTIFICATION_EVENT_SLUG_ALIASES } from './notification-event-registry.definitions';

export type NotificationRetentionClass =
  | 'OPERATIONAL_STATE'
  | 'SHORT_LIVED_EVENT'
  | 'TRANSIENT_EVENT';

export function deriveRetentionClass(
  def: Pick<NotificationEventTypeDefinition, 'eventKind' | 'expiryPolicy'>,
): NotificationRetentionClass {
  if (def.eventKind === NotificationEventKind.STATE) {
    return 'OPERATIONAL_STATE';
  }
  if (def.expiryPolicy?.ttlMs) {
    return 'SHORT_LIVED_EVENT';
  }
  return 'TRANSIENT_EVENT';
}

export function isWorkflowEligible(def: NotificationEventTypeDefinition): boolean {
  return def.sourceType === NotificationSourceType.WORKFLOW || def.producerModule === 'bookings';
}

export function isDeliveryEligible(def: NotificationEventTypeDefinition): boolean {
  return def.deliveryPolicy.channels.length > 0;
}

export interface RegistryConsistencyIssue {
  code: string;
  message: string;
}

/**
 * Static consistency checks for the notification event registry.
 * Used in unit tests — throws nothing; returns human-readable issues.
 */
export function collectRegistryConsistencyIssues(
  definitions: readonly NotificationEventTypeDefinition[] = NOTIFICATION_EVENT_TYPE_DEFINITIONS,
): RegistryConsistencyIssue[] {
  const issues: RegistryConsistencyIssue[] = [];
  const eventTypes = new Map<string, string>();
  const slugs = new Map<string, string>();
  const conditionByEvent = new Map<string, string>();

  for (const def of definitions) {
    if (eventTypes.has(def.eventType)) {
      issues.push({
        code: 'DUPLICATE_EVENT_TYPE',
        message: `Duplicate eventType ${def.eventType} (${eventTypes.get(def.eventType)} vs ${def.slug})`,
      });
    } else {
      eventTypes.set(def.eventType, def.slug);
    }

    if (slugs.has(def.slug)) {
      issues.push({
        code: 'DUPLICATE_SLUG',
        message: `Duplicate slug ${def.slug}`,
      });
    } else {
      slugs.set(def.slug, def.eventType);
    }

    const priorCondition = conditionByEvent.get(def.eventType);
    if (priorCondition && priorCondition !== def.conditionCode) {
      issues.push({
        code: 'MIXED_CONDITION_CODE',
        message: `eventType ${def.eventType} has inconsistent conditionCode`,
      });
    }
    conditionByEvent.set(def.eventType, def.conditionCode);

    if (
      def.defaultSeverity !== NotificationSeverity.SUCCESS
      && !def.allowedSeverityEscalations.includes(def.defaultSeverity)
    ) {
      issues.push({
        code: 'DEFAULT_SEVERITY_NOT_ALLOWED',
        message: `defaultSeverity ${def.defaultSeverity} not in allowedSeverityEscalations for ${def.eventType}`,
      });
    }

    if (def.allowedSeverityEscalations.includes(NotificationSeverity.SUCCESS)) {
      issues.push({
        code: 'SUCCESS_IN_ESCALATIONS',
        message: `SUCCESS must not appear in allowedSeverityEscalations for ${def.eventType}`,
      });
    }

    if (def.eventKind === NotificationEventKind.EVENT && !def.expiryPolicy) {
      issues.push({
        code: 'EVENT_MISSING_EXPIRY',
        message: `EVENT kind ${def.eventType} should define expiryPolicy`,
      });
    }

    if (!def.titleKey.startsWith('notification.') || !def.bodyKey.startsWith('notification.')) {
      issues.push({
        code: 'INVALID_TEMPLATE_KEY',
        message: `titleKey/bodyKey must start with notification. for ${def.eventType}`,
      });
    }
  }

  for (const [alias, canonical] of Object.entries(NOTIFICATION_EVENT_TYPE_ALIASES)) {
    if (!eventTypes.has(canonical)) {
      issues.push({
        code: 'ALIAS_TARGET_MISSING',
        message: `Event type alias ${alias} → ${canonical} points to unregistered eventType`,
      });
    }
    if (alias === canonical) {
      issues.push({
        code: 'REDUNDANT_ALIAS',
        message: `Alias ${alias} is identical to canonical code`,
      });
    }
  }

  for (const [alias, canonicalSlug] of Object.entries(NOTIFICATION_EVENT_SLUG_ALIASES)) {
    if (!slugs.has(canonicalSlug)) {
      issues.push({
        code: 'SLUG_ALIAS_TARGET_MISSING',
        message: `Slug alias ${alias} → ${canonicalSlug} points to unknown slug`,
      });
    }
  }

  return issues;
}

export function assertRegistryConsistency(
  definitions: readonly NotificationEventTypeDefinition[] = NOTIFICATION_EVENT_TYPE_DEFINITIONS,
): void {
  const issues = collectRegistryConsistencyIssues(definitions);
  if (issues.length > 0) {
    throw new Error(
      `Notification event registry consistency failed:\n${issues.map((i) => `- ${i.message}`).join('\n')}`,
    );
  }
}
