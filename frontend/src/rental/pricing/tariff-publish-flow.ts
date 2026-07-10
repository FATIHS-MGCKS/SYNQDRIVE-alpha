/**
 * Flow helpers mirroring TariffGroupDrawer publish orchestration.
 * Intentionally reproduces current production behavior for regression tests.
 */
import type { PriceTariffGroup, PriceTariffVersion } from './pricingTypes';
import { getActiveVersion, getDraftVersion, getEditableVersion } from './pricingUtils';
import {
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './tariff-publish-fixtures';

export type SaveDraftResult =
  | { ok: true; savedVersion: PriceTariffVersion }
  | { ok: false; reason: 'validation' | 'api_error' };

/**
 * Mirrors `TariffGroupDrawer.activate()` after `saveDraft()`:
 * discards `savedVersion` and reads version id from stale `group` prop.
 */
export function resolveActivateVersionIdLikeDrawer(
  savedVersion: PriceTariffVersion | null | undefined,
  staleGroup: PriceTariffGroup,
): string | undefined {
  void savedVersion;
  return getEditableVersion(staleGroup)?.id;
}

export function shouldProceedToActivateAfterSave(saveResult: SaveDraftResult): boolean {
  return saveResult.ok;
}

export function isPublishActionDisabled(state: { saving: boolean; activating: boolean }): boolean {
  return state.activating || state.saving;
}

export function resolvePublishToastOutcome(params: {
  saveResult: SaveDraftResult;
  activateSucceeded: boolean;
}): 'success' | 'save_error' | 'activate_error' {
  if (!params.saveResult.ok) return 'save_error';
  if (!params.activateSucceeded) return 'activate_error';
  return 'success';
}

/** TariffGroupsTab deposit column — always ACTIVE version. */
export function resolveTariffOverviewDepositCents(group: PriceTariffGroup): number | null {
  return getActiveVersion(group)?.rate?.depositAmountCents ?? null;
}

/** TariffGroupDrawer deposit field — DRAFT preferred over ACTIVE. */
export function resolveTariffEditorDepositCents(group: PriceTariffGroup): number | null {
  return getEditableVersion(group)?.rate?.depositAmountCents ?? null;
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
  activateCalled: boolean;
  activateVersionId?: string;
  toast: 'success' | 'save_error' | 'activate_error';
}

/**
 * End-to-end orchestration matching current drawer activate sequence.
 */
export async function runPublishFlowLikeDrawer(params: {
  staleGroup: PriceTariffGroup;
  saveDraft: () => Promise<SaveDraftResult>;
  activateVersion: (versionId: string) => Promise<void>;
}): Promise<SimulatedPublishFlowResult> {
  const saveResult = await params.saveDraft();
  if (!shouldProceedToActivateAfterSave(saveResult)) {
    return { saveCalled: true, activateCalled: false, toast: 'save_error' };
  }

  const versionId = resolveActivateVersionIdLikeDrawer(
    saveResult.ok ? saveResult.savedVersion : null,
    params.staleGroup,
  );
  if (!versionId) {
    return { saveCalled: true, activateCalled: false, toast: 'activate_error' };
  }

  try {
    await params.activateVersion(versionId);
    return {
      saveCalled: true,
      activateCalled: true,
      activateVersionId: versionId,
      toast: 'success',
    };
  } catch {
    return {
      saveCalled: true,
      activateCalled: true,
      activateVersionId: versionId,
      toast: 'activate_error',
    };
  }
}

export { SEDAN_DEPOSIT_ACTIVE_CENTS, SEDAN_DEPOSIT_DRAFT_CENTS };
