import type { PriceTariffGroup, PriceTariffVersion } from './pricingTypes';
import { getActiveVersion, getDraftVersion } from './pricingUtils';
import {
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './tariff-publish-fixtures';

export type SaveDraftResult =
  | { ok: true; savedVersion: PriceTariffVersion }
  | { ok: false; reason: 'validation' | 'api_error'; message: string };

/** Use the version returned by persist — never a stale catalog group snapshot. */
export function resolveActivateVersionId(
  savedVersion: PriceTariffVersion | null | undefined,
): string | undefined {
  const id = savedVersion?.id?.trim();
  return id || undefined;
}

export function shouldProceedToActivateAfterSave(saveResult: SaveDraftResult): boolean {
  return saveResult.ok;
}

export function isPublishActionDisabled(state: { saving: boolean; activating: boolean }): boolean {
  return state.activating || state.saving;
}

export function resolvePublishToastOutcome(params: {
  saveResult: SaveDraftResult;
  publishSucceeded: boolean;
}): 'success' | 'save_error' | 'publish_error' {
  if (!params.saveResult.ok) return 'save_error';
  if (!params.publishSucceeded) return 'publish_error';
  return 'success';
}

export function assertApiTariffVersion(raw: unknown): PriceTariffVersion {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Server antwortete ohne Tarifversion');
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error('Server antwortete ohne Versions-ID');
  }
  return raw as PriceTariffVersion;
}

/** TariffGroupsTab deposit column — always ACTIVE version. */
export function resolveTariffOverviewDepositCents(group: PriceTariffGroup): number | null {
  return getActiveVersion(group)?.rate?.depositAmountCents ?? null;
}

/** TariffGroupDrawer deposit field — DRAFT only (live tariff is read-only). */
export function resolveTariffEditorDepositCents(group: PriceTariffGroup): number | null {
  return getDraftVersion(group)?.rate?.depositAmountCents ?? null;
}

export function isDraftMisrepresentedAsLive(group: PriceTariffGroup): boolean {
  const draft = getDraftVersion(group);
  const active = getActiveVersion(group);
  if (!draft?.rate || !active?.rate) return false;
  return (
    draft.rate.depositAmountCents !== active.rate.depositAmountCents &&
    resolveTariffOverviewDepositCents(group) !== draft.rate.depositAmountCents
  );
}

export interface SimulatedPublishFlowResult {
  saveCalled: boolean;
  publishCalled: boolean;
  publishVersionId?: string;
  toast: 'success' | 'save_error' | 'publish_error';
}

export async function runPublishFlow(params: {
  groupId: string;
  saveDraft: () => Promise<SaveDraftResult>;
  publishDraft: (
    draftVersionId: string,
    expectedVersionNumber?: number,
  ) => Promise<void>;
}): Promise<SimulatedPublishFlowResult> {
  const saveResult = await params.saveDraft();
  if (!saveResult.ok) {
    return { saveCalled: true, publishCalled: false, toast: 'save_error' };
  }

  const versionId = resolveActivateVersionId(saveResult.savedVersion);
  if (!versionId) {
    return { saveCalled: true, publishCalled: false, toast: 'publish_error' };
  }

  try {
    await params.publishDraft(versionId, saveResult.savedVersion.versionNumber);
    return {
      saveCalled: true,
      publishCalled: true,
      publishVersionId: versionId,
      toast: 'success',
    };
  } catch {
    return {
      saveCalled: true,
      publishCalled: true,
      publishVersionId: versionId,
      toast: 'publish_error',
    };
  }
}

export { SEDAN_DEPOSIT_ACTIVE_CENTS, SEDAN_DEPOSIT_DRAFT_CENTS };
