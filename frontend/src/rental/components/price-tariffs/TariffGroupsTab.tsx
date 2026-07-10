import type { PriceTariffCatalog, PriceTariffGroup } from '../../pricing/pricingTypes';
import {
  catalogCurrency,
  countVehiclesInGroup,
  formatDepositCents,
  formatNetAsGross,
  getActiveVersion,
  resolveGroupStatus,
  STATUS_BADGE,
} from '../../pricing/pricingUtils';

interface TariffGroupsTabProps {
  isDarkMode: boolean;
  catalog: PriceTariffCatalog;
  onSelectGroup: (group: PriceTariffGroup) => void;
}

export function TariffGroupsTab({ catalog, onSelectGroup }: TariffGroupsTabProps) {
  const taxRate = catalog.priceBook?.taxRatePercent ?? 19;
  const currency = catalogCurrency(catalog);

  return (
    <div className="surface-premium overflow-hidden rounded-2xl border border-border/50 shadow-[var(--shadow-1)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {[
                'Tariff Group',
                'Vehicles',
                'Daily',
                'Weekly',
                'Monthly',
                'km/day',
                'Extra km',
                'Deposit',
                'Status',
                'Updated',
              ].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.groups.map((group) => {
              const version = getActiveVersion(group) ?? group.versions[0];
              const rate = version?.rate;
              const status = resolveGroupStatus(group, catalog);
              const badge = STATUS_BADGE[status];
              return (
                <tr
                  key={group.id}
                  onClick={() => onSelectGroup(group)}
                  className="cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {group.name}
                    {group.category && group.category !== group.name && (
                      <span className="ml-2 text-[10px] font-medium text-muted-foreground">
                        {group.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{countVehiclesInGroup(catalog, group.id)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {rate && currency ? formatNetAsGross(rate.dailyRateCents, taxRate, currency) : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {rate?.weeklyRateCents && currency
                      ? formatNetAsGross(rate.weeklyRateCents, taxRate, currency)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {rate?.monthlyRateCents && currency
                      ? formatNetAsGross(rate.monthlyRateCents, taxRate, currency)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{rate?.includedKmPerDay ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {rate && currency ? formatNetAsGross(rate.extraKmPriceCents, taxRate, currency) : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {rate && currency ? formatDepositCents(rate.depositAmountCents, currency) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(group.updatedAt).toLocaleDateString('de-DE')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
