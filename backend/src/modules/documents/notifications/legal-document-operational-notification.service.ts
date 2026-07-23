import { Injectable, Logger } from '@nestjs/common';
import { NotificationEntityType } from '@modules/notifications/notification.enums';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { buildCandidateFromRegistry } from '@modules/notifications/registry/notification-event-registry';
import { legalOperationalNotificationFingerprintKey } from './legal-document-operational-notification.dedup';
import {
  buildBundleDerivation,
  buildOrgReadinessDerivation,
  deriveIntegrityTechnicalNotification,
  derivePickupGateNotifications,
  deriveTechnicalNotification,
} from './legal-document-operational-notification.matrix';
import type {
  LegalDocumentBundleNotificationInput,
  LegalDocumentIntegrityNotificationInput,
  LegalDocumentOrgReadinessState,
  LegalDocumentPickupGateNotificationInput,
  LegalDocumentTechnicalNotificationInput,
  LegalOperationalNotificationSignal,
} from './legal-document-operational-notification.types';
import { LegalDocumentOrgReadinessLoader } from './legal-document-org-readiness.loader';

/**
 * Central notification bridge for legal documents — all user and technical alerts
 * are derived from resolver, bundle, integrity, and workflow states only.
 */
@Injectable()
export class LegalDocumentOperationalNotificationService {
  private readonly logger = new Logger(LegalDocumentOperationalNotificationService.name);

  /** Tracks last-known fingerprints per scope for auto-close without DB scans. */
  private readonly scopeFingerprints = new Map<string, Set<string>>();

  constructor(
    private readonly notificationCore: NotificationCoreService,
    private readonly orgReadinessLoader: LegalDocumentOrgReadinessLoader,
  ) {}

  async syncOrgReadiness(state: LegalDocumentOrgReadinessState): Promise<void> {
    const { active, scopeKey } = buildOrgReadinessDerivation(state);
    await this.syncScope(state.organizationId, scopeKey, active);
  }

  async loadAndSyncOrgReadiness(organizationId: string): Promise<void> {
    const state = await this.orgReadinessLoader.loadOrgReadinessState(organizationId);
    await this.syncOrgReadiness(state);
  }

  async syncBundleCompleteness(input: LegalDocumentBundleNotificationInput): Promise<void> {
    const { active, scopeKey } = buildBundleDerivation(input);
    await this.syncScope(input.organizationId, scopeKey, active);
  }

  async syncPickupGateBlock(input: LegalDocumentPickupGateNotificationInput): Promise<void> {
    const scopeKey = `booking-pickup:${input.organizationId}:${input.bookingId}`;
    const active = derivePickupGateNotifications(input);
    await this.syncScope(input.organizationId, scopeKey, active);
  }

  async syncIntegrityTechnicalAlert(
    input: LegalDocumentIntegrityNotificationInput,
  ): Promise<void> {
    const signal = deriveIntegrityTechnicalNotification(input);
    if (!signal) return;
    const scopeKey = `document-integrity:${input.organizationId}:${signal.legalDocumentId ?? input.objectKey}`;
    await this.syncScope(input.organizationId, scopeKey, [signal]);
  }

  async syncTechnicalAlert(input: LegalDocumentTechnicalNotificationInput): Promise<void> {
    const signal = deriveTechnicalNotification(input);
    const scopeKey = `org-technical:${input.organizationId}:${input.eventType}:${input.sourceRef}`;
    await this.syncScope(input.organizationId, scopeKey, [signal]);
  }

  /** @deprecated Bridge — prefer loadAndSyncOrgReadiness. */
  async syncOrgMissingLegalTemplates(
    orgId: string,
    _missingTypes: Array<{ documentType: string } | string>,
  ): Promise<void> {
    await this.loadAndSyncOrgReadiness(orgId);
  }

  private async syncScope(
    organizationId: string,
    scopeKey: string,
    activeSignals: LegalOperationalNotificationSignal[],
  ): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const currentFingerprints = new Set(
      activeSignals.map((s) => legalOperationalNotificationFingerprintKey(organizationId, s)),
    );

    for (const signal of activeSignals) {
      try {
        const candidate = buildCandidateFromRegistry({
          organizationId,
          eventType: signal.eventType,
          entityType: signal.entityType,
          entityId: signal.entityId,
          conditionCodeVariant: signal.conditionVariant,
          sourceRef: signal.sourceRef,
          occurredAt: new Date(),
          severity: signal.severity,
          templateParams: signal.templateParams,
          actionTargetContext: this.actionContext(signal),
          metadata: {
            ...signal.metadata,
            scope: scopeKey,
            legalDocumentId: signal.legalDocumentId,
            settingsTab: signal.settingsTab,
          },
        });
        await this.notificationCore.ingestCandidate(candidate);
      } catch (err: unknown) {
        this.logger.warn(
          `Legal notification ingest failed (${signal.eventType}/${signal.entityId}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const previous = this.scopeFingerprints.get(scopeKey) ?? new Set<string>();
    for (const stale of previous) {
      if (!currentFingerprints.has(stale)) {
        try {
          await this.notificationCore.resolveNotificationByFingerprint({
            organizationId,
            fingerprint: stale,
          });
        } catch (err: unknown) {
          this.logger.debug(
            `resolve stale legal notification (${stale}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    this.scopeFingerprints.set(scopeKey, currentFingerprints);
  }

  private actionContext(signal: LegalOperationalNotificationSignal) {
    if (signal.entityType === NotificationEntityType.BOOKING) {
      return { bookingId: signal.entityId };
    }
    if (signal.settingsTab) {
      return { module: `settings:${signal.settingsTab}` };
    }
    return { module: 'settings:legal-documents' };
  }
}
