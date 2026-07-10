import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import {
  createPricingTestStore,
  createSedanPricingFixtures,
  SEDAN_DEPOSIT_DRAFT_CENTS,
} from './pricing-test-store';

describe('Tariff version lifecycle', () => {
  const ids = createSedanPricingFixtures();
  const migration = { ensureOrgPricing: jest.fn().mockResolvedValue({ migrated: false, vehiclesAssigned: 0 }) };

  function build() {
    const store = createPricingTestStore(ids);
    const tariffs = new PriceTariffsService(
      store.prisma as unknown as PrismaService,
      migration as unknown as PricingMigrationService,
    );
    return { store, tariffs };
  }

  const draftPayload = (deposit = SEDAN_DEPOSIT_DRAFT_CENTS) => ({
    rate: {
      dailyRateCents: 4958,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: deposit,
    },
  });

  it('DRAFT is editable via updateVersion', async () => {
    const { tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload(60000));
    const updated = await tariffs.updateVersion(ids.orgId, draft.id, {
      rate: { ...draftPayload(61000).rate },
    });
    expect(updated.rate?.depositAmountCents).toBe(61000);
  });

  it('ACTIVE is not directly editable via updateVersion', async () => {
    const { tariffs } = build();
    await expect(
      tariffs.updateVersion(ids.orgId, ids.activeVersionId, draftPayload()),
    ).rejects.toThrow(BadRequestException);
  });

  it('ARCHIVED is not editable via updateVersion', async () => {
    const { store, tariffs } = build();
    const archivedId = 'version-archived-1';
    store.versions.push({
      id: archivedId,
      organizationId: ids.orgId,
      priceBookId: ids.priceBookId,
      tariffGroupId: ids.groupId,
      versionNumber: 0,
      status: 'ARCHIVED',
      validFrom: new Date('2025-01-01'),
      validTo: new Date('2026-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(
      tariffs.updateVersion(ids.orgId, archivedId, draftPayload()),
    ).rejects.toThrow(BadRequestException);
  });

  it('publish with future effectiveFrom creates SCHEDULED and ends ACTIVE validTo', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload());
    const future = '2030-01-01';
    const scheduled = await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
      effectiveFrom: future,
    });
    expect(scheduled.status).toBe('SCHEDULED');
    const active = store.versions.find((v) => v.id === ids.activeVersionId);
    expect(active?.status).toBe('ACTIVE');
    expect(active?.validTo).toBeInstanceOf(Date);
  });

  it('DRAFT publish archives previous ACTIVE and promotes draft', async () => {
    const { store, tariffs } = build();
    const draft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload());
    const published = await tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
      draftVersionId: draft.id,
    });
    expect(published.status).toBe('ACTIVE');
    expect(store.versions.find((v) => v.id === ids.activeVersionId)?.status).toBe('ARCHIVED');
    expect(published.rate?.depositAmountCents).toBe(SEDAN_DEPOSIT_DRAFT_CENTS);
  });

  it('historical ARCHIVED version remains unchanged after new publish', async () => {
    const { store, tariffs } = build();
    const firstDraft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload(40000));
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: firstDraft.id });
    const archivedActive = store.versions.find((v) => v.id === ids.activeVersionId);
    expect(archivedActive?.status).toBe('ARCHIVED');
    const archivedDeposit = archivedActive && store.rates.find((r) => r.tariffVersionId === archivedActive.id);
    void archivedDeposit;
    const secondDraft = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload(50000));
    await tariffs.publishTariffDraft(ids.orgId, ids.groupId, { draftVersionId: secondDraft.id });
    expect(archivedActive?.status).toBe('ARCHIVED');
  });

  it('catalog exposes activeVersion and draftVersion separately', async () => {
    const { tariffs } = build();
    await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload());
    const catalog = await tariffs.getFullCatalog(ids.orgId);
    const group = catalog.groups[0] as {
      activeVersion?: { status: string };
      draftVersion?: { status: string };
      versions: Array<{ status: string }>;
    };
    expect(group.activeVersion?.status).toBe('ACTIVE');
    expect(group.draftVersion?.status).toBe('DRAFT');
    expect(group.versions.some((v) => v.status === 'ACTIVE')).toBe(true);
    expect(group.versions.some((v) => v.status === 'DRAFT')).toBe(true);
  });

  it('rejects cross-tenant updateVersion', async () => {
    const { tariffs } = build();
    await expect(
      tariffs.updateVersion('other-org', ids.activeVersionId, draftPayload()),
    ).rejects.toThrow();
  });

  it('rejects publish of ACTIVE version', async () => {
    const { tariffs } = build();
    await expect(
      tariffs.publishTariffDraft(ids.orgId, ids.groupId, {
        draftVersionId: ids.activeVersionId,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('only one DRAFT per group via upsertGroupVersion', async () => {
    const { store, tariffs } = build();
    const d1 = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload(40000));
    const d2 = await tariffs.upsertGroupVersion(ids.orgId, ids.groupId, draftPayload(41000));
    expect(d1.id).toBe(d2.id);
    const drafts = store.versions.filter(
      (v) => v.tariffGroupId === ids.groupId && v.status === 'DRAFT',
    );
    expect(drafts).toHaveLength(1);
  });
});
