import { useMemo, useState } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { usePricingSimulation } from '../../hooks/usePricingSimulation';
import { formatPriceCents, formatPricingContextLabel } from '../../pricing/pricingUtils';
import { isRentalChargeLineType } from '../../pricing/pricingLineItems';

export function PricingSimulatorTab() {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
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
  const taxRatePercent = pricingContext?.taxRatePercent ?? 19;

  const toggle = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="surface-premium space-y-3 rounded-2xl border border-border/50 p-5">
        <h3 className="text-sm font-bold">Inputs</h3>
        <label className="block text-xs">
          Vehicle
          <select
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              setMileagePkg('');
              setInsurances([]);
              setExtras([]);
            }}
            className="mt-1 w-full rounded-xl border border-border surface-premium px-3 py-2 text-xs"
          >
            <option value="">Select…</option>
            {fleetVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.model} · {v.license}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Pickup
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs" />
            <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs" />
          </label>
          <label className="text-xs">
            Return
            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs" />
            <input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs" />
          </label>
        </div>
        {error && (
          <p className="text-xs text-[color:var(--status-critical)]">{error}</p>
        )}
        {pricingContext && (
          <>
            <p className="text-xs text-muted-foreground">
              Resolved: {formatPricingContextLabel(pricingContext)}
            </p>
            <label className="block text-xs">
              Mileage package
              <select value={mileagePkg} onChange={(e) => setMileagePkg(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs">
                <option value="">None</option>
                {pricingContext.mileagePackages.filter((p) => p.isActive).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <div className="text-xs">
              <p className="font-semibold mb-1">Insurance</p>
              {pricingContext.insuranceOptions.filter((o) => o.isActive).map((o) => (
                <label key={o.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={insurances.includes(o.id)} onChange={() => toggle(insurances, o.id, setInsurances)} />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="text-xs">
              <p className="font-semibold mb-1">Extras</p>
              {pricingContext.extraOptions.filter((o) => o.isActive).map((o) => (
                <label key={o.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={extras.includes(o.id)} onChange={() => toggle(extras, o.id, setExtras)} />
                  {o.label}
                </label>
              ))}
            </div>
          </>
        )}
        {!pricingContext && vehicleId && pickupDate && returnDate && loading && (
          <p className="text-xs text-muted-foreground">Resolving tariff for pickup…</p>
        )}
        <label className="block text-xs">
          Manual discount ({displayCurrency ?? 'currency'})
          <input type="number" step="0.01" min="0" value={discountEuro} onChange={(e) => setDiscountEuro(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-xs" />
        </label>
      </div>

      <div className="surface-premium rounded-2xl border border-border/50 p-5">
        <h3 className="text-sm font-bold">Result</h3>
        {loading && <p className="mt-4 text-xs text-muted-foreground">Calculating price…</p>}
        {error && <p className="mt-4 text-xs text-[color:var(--status-critical)]">{error}</p>}
        {!loading && !error && !result && (
          <p className="mt-4 text-xs text-muted-foreground">Select vehicle and dates to simulate.</p>
        )}
        {pricingContext && (
          <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-3 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground">Pricing Debug</p>
            <p>Book: {pricingContext.priceBookName ?? pricingContext.priceBookId}</p>
            <p>Group: {pricingContext.tariffGroupName}</p>
            <p>Version: v{pricingContext.versionNumber} · {pricingContext.tariffVersionId}</p>
            <p>Pickup: {new Date(pricingContext.pickupAt).toLocaleString('de-DE')}</p>
            <p>Deposit: {displayCurrency ? formatPriceCents(pricingContext.depositAmountCents, displayCurrency) : pricingContext.depositAmountCents}</p>
            <p>VAT: {taxRatePercent}%</p>
          </div>
        )}
        {result && (
          <div className="mt-4 space-y-3 text-xs">
            <p>
              <span className="text-muted-foreground">Rental days:</span> {result.rentalDays}
            </p>
            <p>
              <span className="text-muted-foreground">Included km:</span> {result.includedKm}
            </p>
            <p>
              <span className="text-muted-foreground">Currency:</span>{' '}
              {displayCurrency ?? '—'}
            </p>
            <table className="w-full">
              <tbody>
                {result.lineItems
                  .filter((li) => isRentalChargeLineType(li.type))
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((li, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2">{li.label}</td>
                      <td className="py-2 text-right tabular-nums">
                        {displayCurrency
                          ? formatPriceCents(li.totalGrossCents, displayCurrency)
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="border-t border-border/50 pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal net</span>
                <span className="tabular-nums">
                  {displayCurrency ? formatPriceCents(result.subtotalNetCents, displayCurrency) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span className="tabular-nums">
                  {displayCurrency ? formatPriceCents(result.taxAmountCents, displayCurrency) : '—'}
                </span>
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>Total gross</span>
                <span className="tabular-nums">
                  {displayCurrency ? formatPriceCents(result.totalGrossCents, displayCurrency) : '—'}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Deposit</span>
                <span className="tabular-nums">
                  {displayCurrency ? formatPriceCents(result.depositAmountCents, displayCurrency) : '—'}
                </span>
              </div>
            </div>
            {result.warnings?.length > 0 && (
              <ul className="text-[color:var(--status-warning)]">
                {result.warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
