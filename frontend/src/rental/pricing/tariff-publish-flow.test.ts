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
  assertApiTariffVersion,
  isDraftMisrepresentedAsLive,
  isPublishActionDisabled,
  resolveActivateVersionId,
  resolvePublishToastOutcome,
  resolveTariffEditorDepositCents,
  resolveTariffOverviewDepositCents,
  runPublishFlow,
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

  it('publish activates saved draft id, not stale ACTIVE id', () => {
    const savedDraft = createSedanDraftVersionSavedFromActive();

    const versionId = resolveActivateVersionId(savedDraft);

    expect(versionId).toBe(savedDraft.id);
    expect(versionId).not.toBe('version-active-v1');
  });

  it('resolveActivateVersionId ignores stale group prop entirely', () => {
    const savedDraft = createSedanDraftVersionSavedFromActive();
    expect(resolveActivateVersionId(savedDraft)).toBe('version-draft-v2');
    expect(resolveActivateVersionId(undefined)).toBeUndefined();
    expect(resolveActivateVersionId({ ...savedDraft, id: '  ' })).toBeUndefined();
  });

  it('assertApiTariffVersion rejects responses without id', () => {
    expect(() => assertApiTariffVersion(null)).toThrow(/Versions-ID|Tarifversion/);
    expect(() => assertApiTariffVersion({ versionNumber: 2 })).toThrow(/Versions-ID/);
    expect(assertApiTariffVersion(createSedanDraftVersionSavedFromActive()).id).toBe('version-draft-v2');
  });

  it('does not proceed to activate when save draft validation fails', () => {
    expect(shouldProceedToActivateAfterSave({ ok: false, reason: 'validation', message: 'x' })).toBe(false);
  });

  it('does not call activate after failed save in publish orchestration', async () => {
    const activateVersion = vi.fn();
    const result = await runPublishFlow({
      saveDraft: async () => ({ ok: false, reason: 'validation', message: 'Kaution ungültig' }),
      activateVersion,
    });

    expect(result.activateCalled).toBe(false);
    expect(activateVersion).not.toHaveBeenCalled();
    expect(result.toast).toBe('save_error');
    expect(
      resolvePublishToastOutcome({
        saveResult: { ok: false, reason: 'validation', message: 'Kaution ungültig' },
        activateSucceeded: false,
      }),
    ).toBe('save_error');
  });

  it('does not call activate after API save failure', async () => {
    const activateVersion = vi.fn();
    const result = await runPublishFlow({
      saveDraft: async () => ({ ok: false, reason: 'api_error', message: 'Network' }),
      activateVersion,
    });

    expect(result.activateCalled).toBe(false);
    expect(activateVersion).not.toHaveBeenCalled();
    expect(result.toast).toBe('save_error');
  });

  it('prevents double-submit while saving or activating', () => {
    expect(isPublishActionDisabled({ saving: true, activating: false })).toBe(true);
    expect(isPublishActionDisabled({ saving: false, activating: true })).toBe(true);
    expect(isPublishActionDisabled({ saving: false, activating: false })).toBe(false);
  });

  it('shows activate_error toast when activation fails after successful save (no success toast)', () => {
    expect(
      resolvePublishToastOutcome({
        saveResult: { ok: true, savedVersion: createSedanDraftVersionSavedFromActive() },
        activateSucceeded: false,
      }),
    ).toBe('activate_error');
  });

  it('publish flow uses saved draft id so booking would get 50000 deposit', async () => {
    const savedDraft = createSedanDraftVersionSavedFromActive();
    const activateVersion = vi.fn().mockResolvedValue(undefined);

    const result = await runPublishFlow({
      saveDraft: async () => ({ ok: true, savedVersion: savedDraft }),
      activateVersion,
    });

    expect(result.toast).toBe('success');
    expect(activateVersion).toHaveBeenCalledOnce();
    expect(activateVersion).toHaveBeenCalledWith(savedDraft.id);
    expect(activateVersion).not.toHaveBeenCalledWith('version-active-v1');
    expect(result.activateVersionId).toBe(savedDraft.id);
  });

  it('catalog refresh after publish replaces stale group with ACTIVE-only 50000 view', () => {
    const before = createSedanGroupWithActiveAndDraft();
    const after = createSedanGroupAfterSuccessfulPublish();

    expect(isDraftMisrepresentedAsLive(before)).toBe(true);
    expect(isDraftMisrepresentedAsLive(after)).toBe(false);
    expect(resolveTariffOverviewDepositCents(after)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });
});
