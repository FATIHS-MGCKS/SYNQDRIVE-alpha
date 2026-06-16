import { useEffect, useMemo, useState } from 'react';
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
  getEditableVersion,
  rateWarnings,
  validateRateFields,
} from '../../pricing/pricingUtils';
import { countVehiclesInGroup } from '../../pricing/pricingUtils';

interface TariffGroupDrawerProps {
  isDarkMode: boolean;
  orgId: string;
  group: PriceTariffGroup;
  catalog: PriceTariffCatalog | null;
  onClose: () => void;
  onSaved: () => void;
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
  const version = getEditableVersion(group);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [isActive, setIsActive] = useState(group.isActive);
  const [rate, setRate] = useState<TariffRate>(version?.rate ?? emptyRate());
  const [packages, setPackages] = useState<MileagePackageOption[]>(version?.mileagePackages ?? []);
  const [insurances, setInsurances] = useState<InsuranceOptionRow[]>(version?.insuranceOptions ?? []);
  const [extras, setExtras] = useState<ExtraOptionRow[]>(version?.extraOptions ?? []);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    const v = getEditableVersion(group);
    setName(group.name);
    setDescription(group.description ?? '');
    setIsActive(group.isActive);
    setRate(v?.rate ?? emptyRate());
    setPackages(v?.mileagePackages ?? []);
    setInsurances(v?.insuranceOptions ?? []);
    setExtras(v?.extraOptions ?? []);
  }, [group]);

  const dirty = useMemo(() => true, [name, description, isActive, rate, packages, insurances, extras]);

  const inputCls = `w-full rounded-lg border px-3 py-2 text-xs outline-none ${
    isDarkMode
      ? 'border-neutral-700 bg-neutral-800 text-white'
      : 'border-gray-200 bg-white text-gray-900'
  }`;

  const centsField = (
    label: string,
    value: number,
    onChange: (cents: number) => void,
  ) => (
    <label className="block text-xs">
      <span className="font-semibold text-muted-foreground">{label}</span>
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

  const saveDraft = async () => {
    const errors = validateRateFields(rate);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    try {
      await api.pricing.updateGroup(orgId, group.id, {
        name,
        description,
        isActive,
      });
      const versionPayload = {
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
      };
      let savedVersion = version;
      if (version?.status === 'DRAFT') {
        savedVersion = await api.pricing.updateVersion(orgId, version.id, versionPayload);
      } else {
        savedVersion = await api.pricing.upsertVersion(orgId, group.id, versionPayload);
      }
      const warnings = rateWarnings(rate, taxRate);
      if (countVehiclesInGroup(catalog, group.id) === 0) {
        warnings.push('Keine Fahrzeuge zugewiesen');
      }
      if (warnings.length) toast.message('Gespeichert mit Hinweisen', { description: warnings.join(' · ') });
      else toast.success('Tarif gespeichert');
      void savedVersion;
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const activate = async () => {
    setActivating(true);
    try {
      await saveDraft();
      const v = getEditableVersion(group);
      const versionId = v?.id;
      if (!versionId) throw new Error('Keine Version');
      await api.pricing.activateVersion(orgId, versionId);
      toast.success('Version aktiviert — bestehende Buchungen behalten ihren Snapshot');
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Aktivierung fehlgeschlagen');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={`h-full w-full max-w-lg overflow-y-auto shadow-xl ${
          isDarkMode ? 'bg-neutral-900' : 'bg-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-inherit px-5 py-4">
          <div>
            <h2 className="text-sm font-bold">{group.name}</h2>
            <p className="text-[10px] text-muted-foreground">
              Version {version?.versionNumber ?? '—'} · {version?.status ?? '—'}
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
              {centsField('Deposit', rate.depositAmountCents, (v) => setRate({ ...rate, depositAmountCents: v }))}
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
              disabled={!dirty || saving}
              onClick={() => void saveDraft()}
              className="rounded-xl bg-[color:var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={activating}
              onClick={() => void activate()}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Activate version
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
