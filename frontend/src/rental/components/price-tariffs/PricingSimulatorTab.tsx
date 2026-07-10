import { useMemo, useState } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { usePriceTariffs } from '../../hooks/usePriceTariffs';
import { usePricingSimulation } from '../../hooks/usePricingSimulation';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  buildSimulatorPriceBreakdown,
  resolveSimulatorDraftDepositHint,
} from '../../pricing/simulator-price-breakdown';
import { formatPriceCents, getDraftVersion, getActiveVersion } from '../../pricing/pricingUtils';
import { cn } from '../../../components/ui/utils';

export function PricingSimulatorTab() {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const { catalog } = usePriceTariffs(orgId);
  const [vehicleId, setVehicleId] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [pickupTime, setPickupTime] = useState('10:00');
  const [returnTime, setReturnTime] = useState('10:00');
  const [mileagePkg, setMileagePkg] = useState('');
  const [insurances, setInsurances] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [discountEuro, setDiscountEuro] = useState('');

  const simParams = useMemo(() => {
    if (!vehicleId || !pickupDate || !returnDate) return null;
    const pickupAt = new Date(`${pickupDate}T${pickupTime}:00`).toISOString();
    const returnAt = new Date(`${returnDate}T${returnTime}:00`).toISOString();
    return {
      vehicleId,
      pickupAt,
      returnAt,
      pricing: {
        selectedMileagePackageId: mileagePkg || undefined,
        selectedInsuranceOptionIds: insurances.length ? insurances : undefined,
        selectedExtraOptionIds: extras.length ? extras : undefined,
        manualDiscountCents: discountEuro
          ? Math.round(parseFloat(discountEuro) * 100)
          : undefined,
      },
    };
  }, [vehicleId, pickupDate, returnDate, pickupTime, returnTime, mileagePkg, insurances, extras, discountEuro]);

  const { result, loading, error } = usePricingSimulation(orgId, simParams);
  const pricingContext = result?.pricingContext ?? null;
  const displayCurrency = result?.currency ?? pricingContext?.currency ?? null;
  const dateLocale = locale === 'de' ? 'de-DE' : 'en-GB';

  const breakdown = result ? buildSimulatorPriceBreakdown(result) : null;

  const draftDepositHint = useMemo(() => {
    if (!pricingContext || !catalog) return false;
    const group = catalog.groups.find((g) => g.id === pricingContext.tariffGroupId);
    if (!group) return false;
    const live = getActiveVersion(group);
    const draft = getDraftVersion(group);
    if (!live?.rate || !draft?.rate) return false;
    return resolveSimulatorDraftDepositHint({
      tariffGroupId: group.id,
      liveDepositCents: live.rate.depositAmountCents,
      draftDepositCents: draft.rate.depositAmountCents,
    });
  }, [pricingContext, catalog]);

  const toggle = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const fmt = (cents: number) => (displayCurrency ? formatPriceCents(cents, displayCurrency) : '—');

  const fieldClass = 'mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="surface-premium space-y-3 rounded-2xl border border-border/50 p-4 sm:p-5">
        <h3 className="text-sm font-bold">{t('priceTariffs.simulator.inputs')}</h3>
        <label className="block text-xs">
          {t('priceTariffs.simulator.vehicle')}
          <select
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              setMileagePkg('');
              setInsurances([]);
              setExtras([]);
            }}
            className={fieldClass}
          >
            <option value="">{t('priceTariffs.simulator.selectVehicle')}</option>
            {fleetVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.model} · {v.license}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-xs">
            {t('priceTariffs.simulator.pickup')}
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className={fieldClass} />
            <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs">
            {t('priceTariffs.simulator.return')}
            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={fieldClass} />
            <input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} className={fieldClass} />
          </label>
        </div>
        {error ? <p role="alert" className="text-xs text-[color:var(--status-critical)]">{error}</p> : null}
        {pricingContext ? (
          <>
            <label className="block text-xs">
              {t('priceTariffs.simulator.mileagePackage')}
              <select value={mileagePkg} onChange={(e) => setMileagePkg(e.target.value)} className={fieldClass}>
                <option value="">{t('priceTariffs.simulator.none')}</option>
                {pricingContext.mileagePackages.filter((p) => p.isActive).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <div className="text-xs">
              <p className="mb-1 font-semibold">{t('priceTariffs.extras.insurance')}</p>
              {pricingContext.insuranceOptions.filter((o) => o.isActive).map((o) => (
                <label key={o.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={insurances.includes(o.id)} onChange={() => toggle(insurances, o.id, setInsurances)} />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="text-xs">
              <p className="mb-1 font-semibold">{t('priceTariffs.extras.extras')}</p>
              {pricingContext.extraOptions.filter((o) => o.isActive).map((o) => (
                <label key={o.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={extras.includes(o.id)} onChange={() => toggle(extras, o.id, setExtras)} />
                  {o.label}
                </label>
              ))}
            </div>
          </>
        ) : null}
        {!pricingContext && vehicleId && pickupDate && returnDate && loading ? (
          <p className="text-xs text-muted-foreground">{t('priceTariffs.simulator.resolving')}</p>
        ) : null}
        <label className="block text-xs">
          {t('priceTariffs.simulator.manualDiscount', { currency: displayCurrency ?? '—' })}
          <input type="number" step="0.01" min="0" value={discountEuro} onChange={(e) => setDiscountEuro(e.target.value)} className={cn(fieldClass, 'tabular-nums')} />
        </label>
      </div>

      <div className="space-y-4">
        <div className="surface-premium rounded-2xl border border-border/50 p-4 sm:p-5 xl:sticky xl:top-4">
          <h3 className="text-sm font-bold">{t('priceTariffs.simulator.usedTariff')}</h3>
          {!pricingContext ? (
            <p className="mt-3 text-xs text-muted-foreground">{t('priceTariffs.simulator.noContext')}</p>
          ) : (
            <dl className="mt-3 grid gap-1.5 text-[11px]">
              <Row label={t('priceTariffs.simulator.vehicle')} value={vehicleId} mono />
              <Row label={t('priceTariffs.simulator.assignment')} value={pricingContext.assignmentId} mono />
              <Row label={t('priceTariffs.simulator.tariffGroup')} value={pricingContext.tariffGroupName} />
              <Row label={t('priceTariffs.simulator.tariffVersion')} value={`v${pricingContext.versionNumber}`} />
              <Row label={t('priceTariffs.simulator.priceBook')} value={pricingContext.priceBookName ?? pricingContext.priceBookId} />
              <Row label={t('priceTariffs.simulator.currency')} value={pricingContext.currency} />
              <Row
                label={t('priceTariffs.simulator.validFrom')}
                value={new Date(pricingContext.effectiveFrom).toLocaleString(dateLocale)}
              />
              <Row
                label={t('priceTariffs.simulator.validTo')}
                value={
                  pricingContext.effectiveTo
                    ? new Date(pricingContext.effectiveTo).toLocaleString(dateLocale)
                    : '—'
                }
              />
              <Row label={t('priceTariffs.simulator.deposit')} value={fmt(pricingContext.depositAmountCents)} />
              {result?.quoteId ? <Row label={t('priceTariffs.simulator.quoteId')} value={result.quoteId} mono /> : null}
              {result?.expiresAt ? (
                <Row
                  label={t('priceTariffs.simulator.quoteExpires')}
                  value={new Date(result.expiresAt).toLocaleString(dateLocale)}
                />
              ) : null}
            </dl>
          )}
          {draftDepositHint ? (
            <p className="mt-3 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[11px] text-[color:var(--status-watch)]">
              {t('priceTariffs.simulator.draftDepositHint')}
            </p>
          ) : null}
        </div>

        <div className="surface-premium rounded-2xl border border-border/50 p-4 sm:p-5">
          <h3 className="text-sm font-bold">{t('priceTariffs.simulator.result')}</h3>
          {loading ? <p className="mt-4 text-xs text-muted-foreground">{t('priceTariffs.simulator.calculating')}</p> : null}
          {error ? <p role="alert" className="mt-4 text-xs text-[color:var(--status-critical)]">{error}</p> : null}
          {!loading && !error && !result ? (
            <p className="mt-4 text-xs text-muted-foreground">{t('priceTariffs.simulator.empty')}</p>
          ) : null}
          {result && breakdown ? (
            <div className="mt-4 space-y-3 text-xs">
              <p>
                <span className="text-muted-foreground">{t('priceTariffs.simulator.rentalDays')}:</span>{' '}
                <span className="tabular-nums">{result.rentalDays}</span>
              </p>
              <div className="space-y-1 border-t border-border/40 pt-2">
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.rental')} value={fmt(breakdown.baseRentalGrossCents)} />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.mileage')} value={fmt(breakdown.mileageGrossCents)} />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.extras')} value={fmt(breakdown.extrasGrossCents)} />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.insurance')} value={fmt(breakdown.insuranceGrossCents)} />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.discounts')} value={fmt(breakdown.discountsGrossCents)} />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.tax')} value={fmt(breakdown.taxAmountCents)} />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.rentalRevenue')} value={fmt(breakdown.rentalRevenueGrossCents)} strong />
                <BreakdownRow
                  label={t('priceTariffs.simulator.breakdown.deposit')}
                  value={fmt(breakdown.depositAmountCents)}
                  muted
                  note={t('priceTariffs.simulator.breakdown.depositNote')}
                />
                <BreakdownRow label={t('priceTariffs.simulator.breakdown.dueNow')} value={fmt(breakdown.totalDueNowCents)} strong />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,42%)_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-right font-medium text-foreground', mono && 'font-mono text-[10px]')}>{value}</dd>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  strong,
  muted,
  note,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  note?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', muted && 'text-muted-foreground')}>
      <div>
        <span className={cn(strong && 'font-semibold text-foreground')}>{label}</span>
        {note ? <p className="text-[10px] text-muted-foreground">{note}</p> : null}
      </div>
      <span className={cn('shrink-0 tabular-nums', strong && 'font-bold')}>{value}</span>
    </div>
  );
}
