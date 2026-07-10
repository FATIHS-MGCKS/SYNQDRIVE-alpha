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

  it('editor shows no draft deposit until draft exists; draft carries 50000', () => {
    const staleGroup = createStaleSedanGroupWithActiveOnly();
    const draft = createSedanDraftVersionSavedFromActive();

    expect(resolveTariffEditorDepositCents(staleGroup)).toBeNull();
    expect(resolveTariffOverviewDepositCents(staleGroup)).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(draft.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });

  it('overview table keeps showing ACTIVE deposit 17700 while draft with 50000 exists', () => {
    const catalogGroup = createSedanGroupWithActiveAndDraft();

    expect(resolveTariffOverviewDepositCents(catalogGroup)).toBe(SEDAN_DEPOSIT_ACTIVE_CENTS);
    expect(resolveTariffEditorDepositCents(catalogGroup)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(isDraftMisrepresentedAsLive(catalogGroup)).toBe(true);
  });

  it('after successful publish overview shows 50000 and no stray draft', () => {
    const published = createSedanGroupAfterSuccessfulPublish();

    expect(resolveTariffOverviewDepositCents(published)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
    expect(resolveTariffEditorDepositCents(published)).toBeNull();
    expect(isDraftMisrepresentedAsLive(published)).toBe(false);
  });

  it('publish uses saved draft id, not stale ACTIVE id', () => {
    const savedDraft = createSedanDraftVersionSavedFromActive();

    const versionId = resolveActivateVersionId(savedDraft);

    expect(versionId).toBe(savedDraft.id);
    expect(versionId).not.toBe('version-active-v1');
  });

  it('does not proceed to publish when save draft validation fails', () => {
    expect(shouldProceedToActivateAfterSave({ ok: false, reason: 'validation', message: 'x' })).toBe(false);
  });

  it('does not call atomic publish after failed save', async () => {
    const publishDraft = vi.fn();
    const result = await runPublishFlow({
      groupId: 'group-sedan',
      saveDraft: async () => ({ ok: false, reason: 'validation', message: 'Kaution ungültig' }),
      publishDraft,
    });

    expect(result.publishCalled).toBe(false);
    expect(publishDraft).not.toHaveBeenCalled();
    expect(result.toast).toBe('save_error');
  });

  it('prevents double-submit while saving or activating', () => {
    expect(isPublishActionDisabled({ saving: true, activating: false })).toBe(true);
    expect(isPublishActionDisabled({ saving: false, activating: true })).toBe(true);
    expect(isPublishActionDisabled({ saving: false, activating: false })).toBe(false);
  });

  it('shows publish_error toast when publish fails after successful save', () => {
    expect(
      resolvePublishToastOutcome({
        saveResult: { ok: true, savedVersion: createSedanDraftVersionSavedFromActive() },
        publishSucceeded: false,
      }),
    ).toBe('publish_error');
  });

  it('publish flow calls atomic publish with saved draft id and expectedVersionNumber', async () => {
    const savedDraft = createSedanDraftVersionSavedFromActive();
    const publishDraft = vi.fn().mockResolvedValue(undefined);

    const result = await runPublishFlow({
      groupId: 'group-sedan',
      saveDraft: async () => ({ ok: true, savedVersion: savedDraft }),
      publishDraft,
    });

    expect(result.toast).toBe('success');
    expect(publishDraft).toHaveBeenCalledOnce();
    expect(publishDraft).toHaveBeenCalledWith(savedDraft.id, savedDraft.versionNumber);
    expect(publishDraft).not.toHaveBeenCalledWith('version-active-v1');
    expect(result.publishVersionId).toBe(savedDraft.id);
  });

  it('catalog refresh after publish replaces stale group with ACTIVE-only 50000 view', () => {
    const before = createSedanGroupWithActiveAndDraft();
    const after = createSedanGroupAfterSuccessfulPublish();

    expect(isDraftMisrepresentedAsLive(before)).toBe(true);
    expect(isDraftMisrepresentedAsLive(after)).toBe(false);
    expect(resolveTariffOverviewDepositCents(after)).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });

  it('assertApiTariffVersion rejects responses without id', () => {
    expect(() => assertApiTariffVersion(null)).toThrow(/Versions-ID|Tarifversion/);
    expect(assertApiTariffVersion(createSedanDraftVersionSavedFromActive()).id).toBe('version-draft-v2');
  });
});
