import { describe, expect, it, vi } from 'vitest';
import {
  createSedanDraftVersionSavedFromActive,
  createSedanGroupAfterSuccessfulPublish,
  createSedanGroupWithActiveAndDraft,
  createStaleSedanGroupWithActiveOnly,
  SEDAN_DEPOSIT_ACTIVE_CENTS,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './tariff-publish-fixtures';
import {
  isDraftMisrepresentedAsLive,
  isPublishActionDisabled,
  resolveActivateVersionIdLikeDrawer,
  resolvePublishToastOutcome,
  resolveTariffEditorDepositCents,
  resolveTariffOverviewDepositCents,
  runPublishFlowLikeDrawer,
  shouldProceedToActivateAfterSave,
} from './tariff-publish-flow';

describe('Sedan tariff publish flow (deposit 17700 → 50000)', () => {
  it('fixture encodes migration deposit 17700 = 59€ × 3', () => {
    expect(SEDAN_DEPOSIT_ACTIVE_CENTS).toBe(17700);
    expect(SEDAN_DEPOSIT_DRAFT_CENTS).toBe(50000);
  });

  it('editor loads deposit change from 177 to 500 in draft state', () => {
    const staleGroup = createStaleSedanGroupWithActiveOnly();
    const draft = createSedanDraftVersionSavedFromActive();

    expect(resolveTariffEditorDepositCents(staleGroup)).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(draft.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });

  it('overview table keeps showing ACTIVE deposit 17700 while draft with 50000 exists', () => {
    const catalogGroup = createSedanGroupWithActiveAndDraft();

    expect(resolveTariffOverviewDepositCents(catalogGroup)).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(resolveTariffEditorDepositCents(catalogGroup)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(isDraftMisrepresentedAsLive(catalogGroup)).toBe(true);
  });

  it('after successful publish overview and editor both show 50000', () => {
    const published = createSedanGroupAfterSuccessfulPublish();

    expect(resolveTariffOverviewDepositCents(published)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(resolveTariffEditorDepositCents(published)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(isDraftMisrepresentedAsLive(published)).toBe(false);
  });

  it('REGRESSION Prompt 3: publish must activate saved draft id, not stale ACTIVE id', () => {
    const staleGroup = createStaleSedanGroupWithActiveOnly();
    const savedDraft = createSedanDraftVersionSavedFromActive();

    const versionId = resolveActivateVersionIdLikeDrawer(savedDraft, staleGroup);

    expect(versionId).toBe(savedDraft.id);
    expect(versionId).not.toBe('version-active-v1');
  });

  it('does not proceed to activate when save draft validation fails', () => {
    expect(shouldProceedToActivateAfterSave({ ok: false, reason: 'validation' })).toBe(false);
  });

  it('does not call activate after failed save in publish orchestration', async () => {
    const activateVersion = vi.fn();
    const result = await runPublishFlowLikeDrawer({
      staleGroup: createStaleSedanGroupWithActiveOnly(),
      saveDraft: async () => ({ ok: false, reason: 'validation' }),
      activateVersion,
    });

    expect(result.activateCalled).toBe(false);
    expect(activateVersion).not.toHaveBeenCalled();
    expect(result.toast).toBe('save_error');
    expect(resolvePublishToastOutcome({ saveResult: { ok: false, reason: 'validation' }, activateSucceeded: false })).toBe(
      'save_error',
    );
  });

  it('prevents double-submit while saving or activating', () => {
    expect(isPublishActionDisabled({ saving: true, activating: false })).toBe(true);
    expect(isPublishActionDisabled({ saving: false, activating: true })).toBe(true);
    expect(isPublishActionDisabled({ saving: false, activating: false })).toBe(false);
  });

  it('shows activate_error toast when activation fails after successful save', () => {
    expect(
      resolvePublishToastOutcome({
        saveResult: { ok: true, savedVersion: createSedanDraftVersionSavedFromActive() },
        activateSucceeded: false,
      }),
    ).toBe('activate_error');
  });

  it('REGRESSION Prompt 3: publish flow activates stale ACTIVE — booking would keep 17700 deposit', async () => {
    const staleGroup = createStaleSedanGroupWithActiveOnly();
    const savedDraft = createSedanDraftVersionSavedFromActive();
    const activateVersion = vi.fn().mockResolvedValue(undefined);

    const result = await runPublishFlowLikeDrawer({
      staleGroup,
      saveDraft: async () => ({ ok: true, savedVersion: savedDraft }),
      activateVersion,
    });

    expect(result.toast).toBe('success');
    expect(activateVersion).toHaveBeenCalledOnce();
    expect(activateVersion).toHaveBeenCalledWith('version-active-v1');
    expect(activateVersion).not.toHaveBeenCalledWith(savedDraft.id);
    expect(result.activateVersionId).toBe('version-active-v1');
  });
});
