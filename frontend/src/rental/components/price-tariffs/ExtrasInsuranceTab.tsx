import { useState } from 'react';
import type { PriceTariffCatalog } from '../../pricing/pricingTypes';
import { formatNetAsGross, getActiveVersion, catalogCurrency } from '../../pricing/pricingUtils';

interface ExtrasInsuranceTabProps {
  catalog: PriceTariffCatalog;
}

export function ExtrasInsuranceTab({ catalog }: ExtrasInsuranceTabProps) {
  const [groupId, setGroupId] = useState(catalog.groups[0]?.id ?? '');
  const group = catalog.groups.find((g) => g.id === groupId);
  const version = group ? getActiveVersion(group) : null;
  const taxRate = catalog.priceBook?.taxRatePercent ?? 19;
  const currency = catalogCurrency(catalog);

  if (!group || !version) {
    return (
      <p className="text-sm text-muted-foreground">Keine aktive Tarifversion für diese Gruppe.</p>
    );
  }

  return (
    <div className="space-y-4">
      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="rounded-xl border border-border surface-premium px-3 py-2 text-xs"
      >
        {catalog.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      <div className="grid gap-4 lg:grid-cols-3">
        <OptionBlock
          title="Insurance"
          rows={version.insuranceOptions.map((o) => ({
            label: o.label,
            price: currency ? formatNetAsGross(o.priceCents, taxRate, currency) : '—',
            meta: `${o.pricingType === 'PER_DAY' ? 'Per day' : 'Per booking'}${o.isDefault ? ' · Default' : ''}`,
            active: o.isActive,
          }))}
        />
        <OptionBlock
          title="Extras"
          rows={version.extraOptions.map((o) => ({
            label: o.label,
            price: currency ? formatNetAsGross(o.priceCents, taxRate, currency) : '—',
            meta: o.pricingType === 'PER_DAY' ? 'Per day' : 'Per booking',
            active: o.isActive,
          }))}
        />
        <OptionBlock
          title="Mileage packages"
          rows={version.mileagePackages.map((p) => ({
            label: p.label,
            price: currency ? formatNetAsGross(p.priceCents, taxRate, currency) : '—',
            meta: `${p.includedKm} km included`,
            active: p.isActive,
          }))}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Bearbeiten Sie Optionen im Tariff-Group-Drawer (Tab Tariff Groups → Zeile öffnen).
      </p>
    </div>
  );
}

function OptionBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; price: string; meta: string; active: boolean }>;
}) {
  return (
    <div className="surface-premium rounded-2xl border border-border/50 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">None configured</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.label}
              className={`flex items-start justify-between gap-2 rounded-lg border border-border/40 px-3 py-2 ${
                r.active ? '' : 'opacity-50'
              }`}
            >
              <div>
                <p className="text-xs font-semibold">{r.label}</p>
                <p className="text-[10px] text-muted-foreground">{r.meta}</p>
              </div>
              <span className="text-xs font-bold tabular-nums">{r.price}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
