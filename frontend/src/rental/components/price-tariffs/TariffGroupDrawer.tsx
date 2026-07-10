import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../../components/ui/sheet';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type {
  ExtraOptionRow,
  InsuranceOptionRow,
  MileagePackageOption,
  PriceTariffCatalog,
  PriceTariffGroup,
  TariffRate,
} from '../../pricing/pricingTypes';
import {
  assertApiTariffVersion,
  isPublishActionDisabled,
  resolveActivateVersionId,
  type SaveDraftResult,
} from '../../pricing/tariff-publish-flow';
import {
  buildVersionPayloadFromSnapshot,
  createEditorSnapshot,
  isEditorDirty,
  type TariffEditorFormSnapshot,
} from '../../pricing/tariff-editor-form-state';
import { buildLiveDraftComparison } from '../../pricing/tariff-live-draft-compare';
import {
  firstValidationError,
  validateTariffEditorForm,
} from '../../pricing/tariff-editor-validation';
import {
  catalogCurrency,
  countVehiclesInGroup,
  extractPricingApiError,
  getActiveVersion,
  getDraftVersion,
  getEditableVersion,
  getScheduledVersions,
  getTariffFormBaseline,
  rateWarnings,
} from '../../pricing/pricingUtils';
import { TariffEditorLiveDraftCompare } from './tariff-editor/TariffEditorLiveDraftCompare';
import {
  TariffEditorDepositField,
  TariffEditorMoneyField,
} from './tariff-editor/TariffEditorMoneyField';

export type TariffDrawerSavedEvent = {
  mode: 'draft' | 'published';
};

interface TariffGroupDrawerProps {
  isDarkMode: boolean;
  orgId: string;
  group: PriceTariffGroup;
  catalog: PriceTariffCatalog | null;
  onClose: () => void;
  onSaved: (event: TariffDrawerSavedEvent) => void | Promise<void>;
}

const SECTIONS = [
  'general',
  'rental',
  'mileage',
  'deposit',
  'options',
  'publish',
] as const;

type SectionId = (typeof SECTIONS)[number];

const emptyRate = (): TariffRate => ({
  id: '',
  dailyRateCents: 5000,
  weeklyRateCents: 27500,
  monthlyRateCents: 100000,
  includedKmPerDay: 200,
  extraKmPriceCents: 22,
  depositAmountCents: 15000,
  minimumRentalDays: null,
});

function snapshotFromGroup(
  group: PriceTariffGroup,
  baselineRate: TariffRate,
  baselinePackages: MileagePackageOption[],
  baselineInsurances: InsuranceOptionRow[],
  baselineExtras: ExtraOptionRow[],
): TariffEditorFormSnapshot {
  return createEditorSnapshot({
    name: group.name,
    description: group.description ?? '',
    isActive: group.isActive,
    rate: baselineRate,
    packages: baselinePackages,
    insurances: baselineInsurances,
    extras: baselineExtras,
    publishEffectiveFrom: '',
  });
}

export function TariffGroupDrawer({
  isDarkMode,
  orgId,
  group,
  catalog,
  onClose,
  onSaved,
}: TariffGroupDrawerProps) {
  const { t, locale } = useLanguage();
  const taxRate = catalog?.priceBook?.taxRatePercent ?? 19;
  const catalogCcy = catalogCurrency(catalog);
  const liveVersion = getActiveVersion(group);
  const draftVersion = getDraftVersion(group);
  const scheduledVersions = getScheduledVersions(group);
  const formBaseline = getTariffFormBaseline(group);

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [isActive, setIsActive] = useState(group.isActive);
  const [rate, setRate] = useState<TariffRate>(formBaseline?.rate ?? emptyRate());
  const [packages, setPackages] = useState<MileagePackageOption[]>(formBaseline?.mileagePackages ?? []);
  const [insurances, setInsurances] = useState<InsuranceOptionRow[]>(formBaseline?.insuranceOptions ?? []);
  const [extras, setExtras] = useState<ExtraOptionRow[]>(formBaseline?.extraOptions ?? []);
  const [publishEffectiveFrom, setPublishEffectiveFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const publishInFlightRef = useRef(false);
  const baselineRef = useRef<TariffEditorFormSnapshot | null>(null);

  const resetFromGroup = useCallback((g: PriceTariffGroup) => {
    const baseline = getTariffFormBaseline(g);
    const nextRate = baseline?.rate ?? emptyRate();
    const nextPackages = baseline?.mileagePackages ?? [];
    const nextInsurances = baseline?.insuranceOptions ?? [];
    const nextExtras = baseline?.extraOptions ?? [];
    setName(g.name);
    setDescription(g.description ?? '');
    setIsActive(g.isActive);
    setRate(nextRate);
    setPackages(nextPackages);
    setInsurances(nextInsurances);
    setExtras(nextExtras);
    setPublishEffectiveFrom('');
    baselineRef.current = snapshotFromGroup(g, nextRate, nextPackages, nextInsurances, nextExtras);
  }, []);

  useEffect(() => {
    resetFromGroup(group);
  }, [group, resetFromGroup]);

  const currentSnapshot = useMemo(
    () =>
      createEditorSnapshot({
        name,
        description,
        isActive,
        rate,
        packages,
        insurances,
        extras,
        publishEffectiveFrom,
      }),
    [name, description, isActive, rate, packages, insurances, extras, publishEffectiveFrom],
  );

  const dirty = useMemo(() => {
    if (!baselineRef.current) return false;
    return isEditorDirty(currentSnapshot, baselineRef.current);
  }, [currentSnapshot]);

  const fieldErrors = useMemo(
    () => validateTariffEditorForm(currentSnapshot, catalogCcy),
    [currentSnapshot, catalogCcy],
  );

  const compareFields = useMemo(
    () =>
      buildLiveDraftComparison({
        liveVersion,
        draftRate: rate,
        draftPackagesCount: packages.filter((p) => p.isActive).length,
        draftInsurancesCount: insurances.filter((o) => o.isActive).length,
        draftExtrasCount: extras.filter((o) => o.isActive).length,
        taxRate,
        currency: catalogCcy,
      }),
    [liveVersion, rate, packages, insurances, extras, taxRate, catalogCcy],
  );

  const publishDisabled = isPublishActionDisabled({ saving, activating: publishing });
  const isFuturePublish = publishEffectiveFrom
    ? new Date(publishEffectiveFrom).getTime() > Date.now()
    : false;
  const dateLocale = locale === 'de' ? 'de-DE' : 'en-GB';

  const inputCls = cn(
    'w-full rounded-lg border px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    isDarkMode ? 'border-border bg-muted text-foreground' : 'border-gray-200 bg-white text-gray-900',
  );

  const requestClose = () => {
    if (dirty) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  };

  const confirmClose = () => {
    setCloseConfirmOpen(false);
    onClose();
  };

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) requestClose();
  };

  const persistDraft = async (options?: { notifySuccess?: boolean }): Promise<SaveDraftResult> => {
    const validationKey = firstValidationError(fieldErrors);
    if (validationKey) {
      return { ok: false, reason: 'validation', message: t(validationKey as never) };
    }

    setSaving(true);
    try {
      await api.pricing.updateGroup(orgId, group.id, { name, description, isActive });

      const editableVersion = getEditableVersion(group);
      const versionPayload = buildVersionPayloadFromSnapshot(currentSnapshot);
      let rawSaved: unknown;
      if (editableVersion?.status === 'DRAFT') {
        rawSaved = await api.pricing.updateVersion(orgId, editableVersion.id, versionPayload);
      } else {
        rawSaved = await api.pricing.upsertVersion(orgId, group.id, versionPayload);
      }
      const savedVersion = assertApiTariffVersion(rawSaved);

      if (options?.notifySuccess) {
        const warnings = rateWarnings(rate, taxRate);
        if (countVehiclesInGroup(catalog, group.id) === 0) {
          warnings.push(t('priceTariffs.editor.warnings.noVehicles'));
        }
        if (warnings.length) {
          toast.message(t('priceTariffs.editor.savedWithWarnings'), {
            description: warnings.join(' · '),
          });
        } else {
          toast.success(t('priceTariffs.editor.draftSaved'));
        }
      }

      return { ok: true, savedVersion };
    } catch (e: unknown) {
      const structured = extractPricingApiError(e);
      const message = structured?.message ?? (e instanceof Error ? e.message : t('priceTariffs.editor.saveFailed'));
      return { ok: false, reason: 'api_error', message };
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (publishInFlightRef.current || publishDisabled || !dirty) return;
    publishInFlightRef.current = true;
    try {
      const result = await persistDraft({ notifySuccess: true });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await onSaved({ mode: 'draft' });
    } finally {
      publishInFlightRef.current = false;
    }
  };

  const publish = async () => {
    if (publishInFlightRef.current || publishDisabled) return;
    publishInFlightRef.current = true;
    setPublishing(true);
    try {
      const saveResult = await persistDraft({ notifySuccess: false });
      if (!saveResult.ok) {
        toast.error(saveResult.message);
        return;
      }

      const versionId = resolveActivateVersionId(saveResult.savedVersion);
      if (!versionId) {
        toast.error(t('priceTariffs.editor.publishNoVersion'));
        return;
      }

      await api.pricing.publishDraft(orgId, group.id, {
        draftVersionId: versionId,
        expectedVersionNumber: saveResult.savedVersion.versionNumber,
        ...(publishEffectiveFrom ? { effectiveFrom: publishEffectiveFrom } : {}),
      });

      toast.success(
        isFuturePublish
          ? t('priceTariffs.editor.scheduledSuccess')
          : t('priceTariffs.editor.publishSuccess'),
      );
      await onSaved({ mode: 'published' });
    } catch (e: unknown) {
      const structured = extractPricingApiError(e);
      toast.error(structured?.message ?? t('priceTariffs.editor.publishFailed'));
    } finally {
      setPublishing(false);
      publishInFlightRef.current = false;
    }
  };

  const sectionTitle = (id: SectionId) => t(`priceTariffs.editor.sections.${id}` as never);
  const sectionNavId = useId();

  const renderSectionNav = () => (
    <div
      className="flex gap-1 overflow-x-auto pb-1 lg:hidden"
      role="tablist"
      aria-label={t('priceTariffs.editor.drawerTitle')}
    >
      {SECTIONS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${sectionNavId}-tab-${id}`}
          aria-selected={activeSection === id}
          aria-controls={`${sectionNavId}-panel-${id}`}
          onClick={() => setActiveSection(id)}
          className={cn(
            'shrink-0 rounded-lg px-2.5 py-2 text-[10px] font-semibold min-h-11',
            activeSection === id ? 'bg-muted text-foreground' : 'text-muted-foreground',
          )}
        >
          {sectionTitle(id)}
        </button>
      ))}
    </div>
  );


  const editableDraftVersion = draftVersion ?? getEditableVersion(group);

  return (
    <>
      <Sheet open onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            'flex h-full w-full max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl [&>button]:hidden',
            isDarkMode ? 'surface-premium' : 'bg-white',
          )}
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (dirty) {
              e.preventDefault();
              setCloseConfirmOpen(true);
            }
          }}
        >
          <SheetTitle className="sr-only">{t('priceTariffs.editor.drawerTitle')}</SheetTitle>
          <SheetDescription className="sr-only">
            {editableDraftVersion
              ? t('priceTariffs.editor.headerDraft', { version: editableDraftVersion.versionNumber })
              : liveVersion
                ? t('priceTariffs.editor.headerLiveEdit', { version: liveVersion.versionNumber })
                : t('priceTariffs.editor.headerNoVersion')}
          </SheetDescription>

          <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3 sm:px-5">
            <div className="min-w-0 pr-8">
              <h2 className="truncate text-sm font-bold" id="tariff-editor-heading">
                {name || group.name}
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {editableDraftVersion
                  ? t('priceTariffs.editor.headerDraft', { version: editableDraftVersion.versionNumber })
                  : liveVersion
                    ? t('priceTariffs.editor.headerLiveEdit', { version: liveVersion.versionNumber })
                    : t('priceTariffs.editor.headerNoVersion')}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="absolute right-4 top-3 rounded-lg p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28 sm:px-5 lg:pb-4">
              {renderSectionNav()}

              <div className="space-y-6 text-xs">
                <section
                  id={`${sectionNavId}-panel-general`}
                  role="tabpanel"
                  aria-labelledby={`${sectionNavId}-tab-general`}
                  className={cn(activeSection === 'general' ? 'block' : 'hidden', 'lg:block')}
                >
                  <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">
                    {sectionTitle('general')}
                  </h3>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="font-semibold text-muted-foreground">{t('priceTariffs.editor.fields.name')}</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, 'mt-1', fieldErrors.name && 'border-[color:var(--status-critical)]')} />
                      {fieldErrors.name ? <p className="mt-1 text-[10px] text-[color:var(--status-critical)]">{t(fieldErrors.name as never)}</p> : null}
                    </label>
                    <label className="block">
                      <span className="font-semibold text-muted-foreground">{t('priceTariffs.editor.fields.description')}</span>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={cn(inputCls, 'mt-1 resize-none')} />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2">
                        <p className="text-[10px] font-semibold text-muted-foreground">{t('priceTariffs.editor.fields.currency')}</p>
                        <p className="mt-1 font-semibold tabular-nums">{catalogCcy ?? '—'}</p>
                        {fieldErrors.currency ? <p className="mt-1 text-[10px] text-[color:var(--status-critical)]">{t(fieldErrors.currency as never)}</p> : null}
                      </div>
                      <div className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2">
                        <p className="text-[10px] font-semibold text-muted-foreground">{t('priceTariffs.editor.fields.vehicles')}</p>
                        <p className="mt-1 font-semibold tabular-nums">{countVehiclesInGroup(catalog, group.id)}</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                      {t('priceTariffs.editor.fields.groupActive')}
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      {liveVersion
                        ? t('priceTariffs.editor.fields.currentVersion', { version: liveVersion.versionNumber })
                        : t('priceTariffs.row.notPublished')}
                    </p>
                  </div>
                </section>

              <section id="rental" className={cn(activeSection === 'rental' ? 'block' : 'hidden', 'lg:block')}>
                  <h3 className="mb-1 font-bold uppercase tracking-wider text-muted-foreground">{sectionTitle('rental')}</h3>
                  <p className="mb-3 text-[10px] text-muted-foreground">{t('priceTariffs.editor.rentalNetHint', { tax: taxRate })}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TariffEditorMoneyField
                      label={t('priceTariffs.editor.fields.daily')}
                      netCents={rate.dailyRateCents}
                      taxRate={taxRate}
                      currency={catalogCcy}
                      onNetCentsChange={(v) => setRate({ ...rate, dailyRateCents: v })}
                      error={fieldErrors.dailyRateCents ? t(fieldErrors.dailyRateCents as never) : undefined}
                      required
                      inputClassName={inputCls}
                      grossPreviewLabel={t('priceTariffs.editor.fields.netStored')}
                    />
                    <TariffEditorMoneyField
                      label={t('priceTariffs.editor.fields.weekly')}
                      netCents={rate.weeklyRateCents}
                      taxRate={taxRate}
                      currency={catalogCcy}
                      onNetCentsChange={(v) => setRate({ ...rate, weeklyRateCents: v })}
                      error={fieldErrors.weeklyRateCents ? t(fieldErrors.weeklyRateCents as never) : undefined}
                      inputClassName={inputCls}
                      grossPreviewLabel={t('priceTariffs.editor.fields.netStored')}
                    />
                    <TariffEditorMoneyField
                      label={t('priceTariffs.editor.fields.monthly')}
                      netCents={rate.monthlyRateCents}
                      taxRate={taxRate}
                      currency={catalogCcy}
                      onNetCentsChange={(v) => setRate({ ...rate, monthlyRateCents: v })}
                      error={fieldErrors.monthlyRateCents ? t(fieldErrors.monthlyRateCents as never) : undefined}
                      inputClassName={inputCls}
                      grossPreviewLabel={t('priceTariffs.editor.fields.netStored')}
                    />
                  </div>
                </section>

              <section id="mileage" className={cn(activeSection === 'mileage' ? 'block' : 'hidden', 'lg:block')}>
                  <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">{sectionTitle('mileage')}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="font-semibold text-muted-foreground">{t('priceTariffs.editor.fields.includedKmPerDay')}</span>
                      <input type="number" min="0" value={rate.includedKmPerDay} onChange={(e) => setRate({ ...rate, includedKmPerDay: parseInt(e.target.value || '0', 10) })} className={cn(inputCls, 'mt-1 tabular-nums')} />
                    </label>
                    <TariffEditorMoneyField
                      label={t('priceTariffs.editor.fields.extraKm')}
                      netCents={rate.extraKmPriceCents}
                      taxRate={taxRate}
                      currency={catalogCcy}
                      onNetCentsChange={(v) => setRate({ ...rate, extraKmPriceCents: v })}
                      inputClassName={inputCls}
                      grossPreviewLabel={t('priceTariffs.editor.fields.netStored')}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">{t('priceTariffs.editor.mileagePackagesHint', { count: packages.length })}</p>
                </section>

              <section
                id="deposit"
                className={cn(
                  'rounded-xl border border-[color:var(--status-info)]/20 bg-muted/10 p-3',
                  activeSection === 'deposit' ? 'block' : 'hidden',
                  'lg:block',
                )}
              >
                  <h3 className="mb-1 font-bold uppercase tracking-wider text-muted-foreground">{sectionTitle('deposit')}</h3>
                  <p className="mb-3 text-[10px] text-muted-foreground">{t('priceTariffs.editor.depositHint')}</p>
                  <TariffEditorDepositField
                    label={t('priceTariffs.editor.fields.deposit')}
                    cents={rate.depositAmountCents}
                    currency={catalogCcy}
                    onCentsChange={(v) => setRate({ ...rate, depositAmountCents: v })}
                    error={fieldErrors.depositAmountCents ? t(fieldErrors.depositAmountCents as never) : undefined}
                    hint={t('priceTariffs.editor.depositTaxFree')}
                    inputClassName={inputCls}
                  />
                </section>

              <section id="options" className={cn(activeSection === 'options' ? 'block' : 'hidden', 'lg:block')}>
                  <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">{sectionTitle('options')}</h3>
                  <p className="mb-2 text-[10px] text-muted-foreground">{t('priceTariffs.editor.optionsIdHint')}</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <OptionListPanel
                      title={t('priceTariffs.extras.insurance')}
                      count={insurances.filter((o) => o.isActive).length}
                      empty={t('priceTariffs.extras.noneConfigured')}
                      activeLabel={t('priceTariffs.editor.optionsActiveCount', {
                        count: insurances.filter((o) => o.isActive).length,
                      })}
                    />
                    <OptionListPanel
                      title={t('priceTariffs.extras.extras')}
                      count={extras.filter((o) => o.isActive).length}
                      empty={t('priceTariffs.extras.noneConfigured')}
                      activeLabel={t('priceTariffs.editor.optionsActiveCount', {
                        count: extras.filter((o) => o.isActive).length,
                      })}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {t('priceTariffs.editor.optionsEditHint', {
                      insurance: insurances.length,
                      extras: extras.length,
                      packages: packages.length,
                    })}
                  </p>
                </section>

              <section id="publish" className={cn(activeSection === 'publish' ? 'block' : 'hidden', 'lg:block')}>
                <div className="mb-4 lg:hidden">
                  <TariffEditorLiveDraftCompare
                    liveVersionNumber={liveVersion?.versionNumber ?? null}
                    draftVersionNumber={editableDraftVersion?.versionNumber ?? (liveVersion ? liveVersion.versionNumber + 1 : 1)}
                    liveValidFrom={liveVersion?.validFrom ?? null}
                    fields={compareFields}
                  />
                </div>
                  <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">{sectionTitle('publish')}</h3>
                  <label className="block">
                    <span className="font-semibold text-muted-foreground">{t('priceTariffs.editor.fields.validFrom')}</span>
                    <input
                      type="date"
                      value={publishEffectiveFrom}
                      onChange={(e) => setPublishEffectiveFrom(e.target.value)}
                      className={cn(inputCls, 'mt-1')}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">{t('priceTariffs.editor.validFromHint')}</p>
                  </label>
                  {scheduledVersions.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-[10px] text-muted-foreground">
                      {scheduledVersions.map((v) => (
                        <li key={v.id}>
                          {t('priceTariffs.editor.scheduledVersion', {
                            version: v.versionNumber,
                            date: new Date(v.validFrom).toLocaleDateString(dateLocale),
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
            </div>
          </div>

          <aside className="flex w-full shrink-0 flex-col border-t border-border/50 lg:w-80 lg:border-l lg:border-t-0">
            <div className="hidden max-h-[50vh] overflow-y-auto p-4 lg:block lg:max-h-none lg:flex-1">
              <TariffEditorLiveDraftCompare
                liveVersionNumber={liveVersion?.versionNumber ?? null}
                draftVersionNumber={editableDraftVersion?.versionNumber ?? (liveVersion ? liveVersion.versionNumber + 1 : 1)}
                liveValidFrom={liveVersion?.validFrom ?? null}
                fields={compareFields}
              />
            </div>
            <div
              className="sticky bottom-0 border-t border-border/50 bg-inherit p-4 lg:static"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="min-h-11"
                  disabled={!dirty || publishDisabled}
                  aria-busy={saving}
                  onClick={() => void saveDraft()}
                >
                  {saving ? t('priceTariffs.editor.saving') : t('priceTariffs.editor.saveDraft')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  disabled={publishDisabled}
                  aria-busy={publishing}
                  onClick={() => void publish()}
                >
                  {publishing
                    ? t('priceTariffs.editor.publishing')
                    : isFuturePublish
                      ? t('priceTariffs.editor.scheduleChange')
                      : t('priceTariffs.editor.publishChanges')}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={requestClose}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('priceTariffs.editor.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('priceTariffs.editor.unsavedDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('priceTariffs.editor.unsavedStay')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>{t('priceTariffs.editor.unsavedLeave')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OptionListPanel({
  title,
  count,
  empty,
  activeLabel,
}: {
  title: string;
  count: number;
  empty: string;
  activeLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">{count > 0 ? activeLabel : empty}</p>
    </div>
  );
}
