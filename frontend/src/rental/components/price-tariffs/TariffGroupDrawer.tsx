import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
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
  catalogCurrency,
  countVehiclesInGroup,
  getActiveVersion,
  getDraftVersion,
  getEditableVersion,
  getTariffFormBaseline,
  rateWarnings,
  validateRateFields,
} from '../../pricing/pricingUtils';

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

export function TariffGroupDrawer({
  isDarkMode,
  orgId,
  group,
  catalog,
  onClose,
  onSaved,
}: TariffGroupDrawerProps) {
  const taxRate = catalog?.priceBook?.taxRatePercent ?? 19;
  const catalogCcy = catalogCurrency(catalog);
  const draftVersion = getDraftVersion(group);
  const liveVersion = getActiveVersion(group);
  const formBaseline = getTariffFormBaseline(group);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [isActive, setIsActive] = useState(group.isActive);
  const [rate, setRate] = useState<TariffRate>(formBaseline?.rate ?? emptyRate());
  const [packages, setPackages] = useState<MileagePackageOption[]>(formBaseline?.mileagePackages ?? []);
  const [insurances, setInsurances] = useState<InsuranceOptionRow[]>(formBaseline?.insuranceOptions ?? []);
  const [extras, setExtras] = useState<ExtraOptionRow[]>(formBaseline?.extraOptions ?? []);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const publishInFlightRef = useRef(false);

  useEffect(() => {
    const baseline = getTariffFormBaseline(group);
    setName(group.name);
    setDescription(group.description ?? '');
    setIsActive(group.isActive);
    setRate(baseline?.rate ?? emptyRate());
    setPackages(baseline?.mileagePackages ?? []);
    setInsurances(baseline?.insuranceOptions ?? []);
    setExtras(baseline?.extraOptions ?? []);
  }, [group]);

  const dirty = useMemo(() => true, [name, description, isActive, rate, packages, insurances, extras]);
  const publishDisabled = isPublishActionDisabled({ saving, activating });

  const inputCls = `w-full rounded-lg border px-3 py-2 text-xs outline-none ${
    isDarkMode
      ? 'border-border bg-muted text-foreground'
      : 'border-gray-200 bg-white text-gray-900'
  }`;

  const centsField = (
    label: string,
    value: number,
    onChange: (cents: number) => void,
  ) => (
    <label className="block text-xs">
      <span className="font-semibold text-muted-foreground">
        {label}
        {catalogCcy ? ` (${catalogCcy})` : ''}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={(value / 100).toFixed(2)}
        onChange={(e) => onChange(Math.round(parseFloat(e.target.value || '0') * 100))}
        className={`${inputCls} mt-1`}
      />
    </label>
  );

  const buildVersionPayload = () => ({
    rate: {
      dailyRateCents: rate.dailyRateCents,
      weeklyRateCents: rate.weeklyRateCents,
      monthlyRateCents: rate.monthlyRateCents,
      includedKmPerDay: rate.includedKmPerDay,
      extraKmPriceCents: rate.extraKmPriceCents,
      depositAmountCents: rate.depositAmountCents,
      minimumRentalDays: rate.minimumRentalDays ?? undefined,
    },
    mileagePackages: packages.map((p) => ({
      id: p.id,
      label: p.label,
      includedKm: p.includedKm,
      priceCents: p.priceCents,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })),
    insuranceOptions: insurances.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description ?? undefined,
      priceCents: o.priceCents,
      pricingType: o.pricingType,
      deductibleCents: o.deductibleCents ?? undefined,
      isDefault: o.isDefault,
      isActive: o.isActive,
      sortOrder: o.sortOrder,
    })),
    extraOptions: extras.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description ?? undefined,
      priceCents: o.priceCents,
      pricingType: o.pricingType,
      isActive: o.isActive,
      sortOrder: o.sortOrder,
    })),
  });

  const persistDraft = async (options?: {
    notifySuccess?: boolean;
  }): Promise<SaveDraftResult> => {
    const errors = validateRateFields(rate);
    if (errors.length) {
      return { ok: false, reason: 'validation', message: errors[0] };
    }

    setSaving(true);
    try {
      await api.pricing.updateGroup(orgId, group.id, {
        name,
        description,
        isActive,
      });

      const editableVersion = getEditableVersion(group);
      const versionPayload = buildVersionPayload();
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
          warnings.push('Keine Fahrzeuge zugewiesen');
        }
        if (warnings.length) {
          toast.message('Gespeichert mit Hinweisen', { description: warnings.join(' · ') });
        } else {
          toast.success('Tarif gespeichert');
        }
      }

      return { ok: true, savedVersion };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Speichern fehlgeschlagen';
      return { ok: false, reason: 'api_error', message };
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (publishInFlightRef.current || publishDisabled) return;
    publishInFlightRef.current = true;
    try {
      const result = await persistDraft({ notifySuccess: true });
      if (!result.ok) {
        toast.error(
          result.reason === 'validation'
            ? `Entwurf ungültig: ${result.message}`
            : `Speichern fehlgeschlagen: ${result.message}`,
        );
        return;
      }
      await onSaved({ mode: 'draft' });
    } finally {
      publishInFlightRef.current = false;
    }
  };

  const activate = async () => {
    if (publishInFlightRef.current || publishDisabled) return;
    publishInFlightRef.current = true;
    setActivating(true);
    try {
      const saveResult = await persistDraft({ notifySuccess: false });
      if (!saveResult.ok) {
        toast.error(
          saveResult.reason === 'validation'
            ? `Veröffentlichen abgebrochen — Entwurf ungültig: ${saveResult.message}`
            : `Veröffentlichen abgebrochen — Speichern fehlgeschlagen: ${saveResult.message}`,
        );
        return;
      }

      const versionId = resolveActivateVersionId(saveResult.savedVersion);
      if (!versionId) {
        toast.error('Veröffentlichen fehlgeschlagen: Keine gespeicherte Versions-ID');
        return;
      }

      await api.pricing.publishDraft(orgId, group.id, {
        draftVersionId: versionId,
        expectedVersionNumber: saveResult.savedVersion.versionNumber,
      });
      toast.success('Version aktiviert — bestehende Buchungen behalten ihren Snapshot');
      await onSaved({ mode: 'published' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Veröffentlichen fehlgeschlagen';
      toast.error(`Veröffentlichen fehlgeschlagen: ${message}`);
    } finally {
      setActivating(false);
      publishInFlightRef.current = false;
    }
  };

    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={`h-full w-full max-w-lg overflow-y-auto shadow-xl ${
          isDarkMode ? 'surface-premium' : 'bg-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-inherit px-5 py-4">
          <div>
            <h2 className="text-sm font-bold">{group.name}</h2>
            <p className="text-[10px] text-muted-foreground">
              {draftVersion
                ? `Draft v${draftVersion.versionNumber}`
                : liveVersion
                  ? `Live v${liveVersion.versionNumber} — edits create draft`
                  : 'No version'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5 text-xs">
          <section>
            <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">Basic</h3>
            <div className="space-y-2">
              <label className="block">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1`} />
              </label>
              <label className="block">
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} mt-1 resize-none`} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Group active
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">Rates (net, stored in cents)</h3>
            <div className="grid grid-cols-2 gap-2">
              {centsField('Daily', rate.dailyRateCents, (v) => setRate({ ...rate, dailyRateCents: v }))}
              {centsField('Weekly', rate.weeklyRateCents, (v) => setRate({ ...rate, weeklyRateCents: v }))}
              {centsField('Monthly', rate.monthlyRateCents, (v) => setRate({ ...rate, monthlyRateCents: v }))}
              {centsField('Extra km', rate.extraKmPriceCents, (v) => setRate({ ...rate, extraKmPriceCents: v }))}
              <label className="block">
                <span className="font-semibold text-muted-foreground">Included km/day</span>
                <input
                  type="number"
                  min="0"
                  value={rate.includedKmPerDay}
                  onChange={(e) => setRate({ ...rate, includedKmPerDay: parseInt(e.target.value || '0', 10) })}
                  className={`${inputCls} mt-1`}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-bold uppercase tracking-wider text-muted-foreground">
              Deposit (refundable, gross)
            </h3>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Stored as integer cents. Not subject to VAT and not part of rental revenue.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {centsField('Deposit', rate.depositAmountCents, (v) => setRate({ ...rate, depositAmountCents: v }))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-bold uppercase tracking-wider text-muted-foreground">
              Assigned vehicles ({countVehiclesInGroup(catalog, group.id)})
            </h3>
            <p className="text-muted-foreground">Zuweisungen im Tab Vehicle Assignments verwalten.</p>
          </section>

          <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
            Änderungen an aktiven Tarifen erzeugen eine neue Draft-Version oder aktualisieren den Entwurf.
            Bereits erstellte Buchungen behalten ihren gespeicherten Preis-Snapshot.
          </p>

          <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
            <button
              type="button"
              disabled={!dirty || publishDisabled}
              onClick={() => void saveDraft()}
              className="rounded-xl bg-[color:var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={publishDisabled}
              onClick={() => void activate()}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {activating ? 'Publishing…' : 'Activate version'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs text-muted-foreground">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
