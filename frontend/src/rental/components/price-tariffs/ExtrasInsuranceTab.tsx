import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { PriceTariffCatalog, PriceTariffGroup } from '../../pricing/pricingTypes';
import {
  catalogCurrency,
  formatNetAsGross,
  getActiveVersion,
  getDraftVersion,
} from '../../pricing/pricingUtils';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../../../components/ui/button';

interface ExtrasInsuranceTabProps {
  catalog: PriceTariffCatalog;
  onEditGroup: (group: PriceTariffGroup) => void;
}

export function ExtrasInsuranceTab({ catalog, onEditGroup }: ExtrasInsuranceTabProps) {
  const { t } = useLanguage();
  const [groupId, setGroupId] = useState(catalog.groups[0]?.id ?? '');
  const group = catalog.groups.find((g) => g.id === groupId);
  const liveVersion = group ? getActiveVersion(group) : null;
  const draftVersion = group ? getDraftVersion(group) : null;
  const displayVersion = draftVersion ?? liveVersion;
  const taxRate = catalog.priceBook?.taxRatePercent ?? 19;
  const currency = catalogCurrency(catalog);

  if (!catalog.groups.length) {
    return (
      <p className="text-sm text-muted-foreground">{t('priceTariffs.extras.noGroups')}</p>
    );
  }

  if (!group) {
    return (
      <p className="text-sm text-muted-foreground">{t('priceTariffs.extras.selectGroup')}</p>
    );
  }

  const insuranceCount = displayVersion?.insuranceOptions.filter((o) => o.isActive).length ?? 0;
  const extrasCount = displayVersion?.extraOptions.filter((o) => o.isActive).length ?? 0;
  const mileageCount = displayVersion?.mileagePackages.filter((p) => p.isActive).length ?? 0;
  const editingDraft = !!draftVersion;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1 text-xs">
          <span className="font-semibold text-muted-foreground">{t('priceTariffs.extras.groupLabel')}</span>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border surface-premium px-3 py-2 text-xs"
          >
            {catalog.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="primary" size="sm" onClick={() => onEditGroup(group)}>
          <Pencil className="h-3.5 w-3.5" />
          {t('priceTariffs.extras.editInDrawer')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {editingDraft
          ? t('priceTariffs.extras.draftContext')
          : t('priceTariffs.extras.liveContext')}
      </p>

      {!displayVersion ? (
        <div className="surface-premium rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">{t('priceTariffs.extras.noVersionTitle')}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('priceTariffs.extras.noVersionDescription')}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => onEditGroup(group)}>
            {t('priceTariffs.extras.configureTariff')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <OptionBlock
            title={t('priceTariffs.extras.insurance')}
            count={insuranceCount}
            rows={displayVersion.insuranceOptions.map((o) => ({
              label: o.label,
              price:
                currency && o.isActive
                  ? formatNetAsGross(o.priceCents, taxRate, currency)
                  : '—',
              meta:
                o.pricingType === 'PER_DAY'
                  ? t('priceTariffs.extras.perDay')
                  : t('priceTariffs.extras.perBooking'),
              active: o.isActive,
            }))}
            emptyLabel={t('priceTariffs.extras.noneConfigured')}
          />
          <OptionBlock
            title={t('priceTariffs.extras.extras')}
            count={extrasCount}
            rows={displayVersion.extraOptions.map((o) => ({
              label: o.label,
              price:
                currency && o.isActive
                  ? formatNetAsGross(o.priceCents, taxRate, currency)
                  : '—',
              meta:
                o.pricingType === 'PER_DAY'
                  ? t('priceTariffs.extras.perDay')
                  : t('priceTariffs.extras.perBooking'),
              active: o.isActive,
            }))}
            emptyLabel={t('priceTariffs.extras.noneConfigured')}
          />
          <OptionBlock
            title={t('priceTariffs.extras.mileage')}
            count={mileageCount}
            rows={displayVersion.mileagePackages.map((p) => ({
              label: p.label,
              price:
                currency && p.isActive
                  ? formatNetAsGross(p.priceCents, taxRate, currency)
                  : '—',
              meta: t('priceTariffs.extras.kmIncluded', { km: p.includedKm }),
              active: p.isActive,
            }))}
            emptyLabel={t('priceTariffs.extras.noneConfigured')}
          />
        </div>
      )}
    </div>
  );
}

function OptionBlock({
  title,
  count,
  rows,
  emptyLabel,
}: {
  title: string;
  count: number;
  rows: Array<{ label: string; price: string; meta: string; active: boolean }>;
  emptyLabel: string;
}) {
  return (
    <div className="surface-premium rounded-2xl border border-border/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{emptyLabel}</p>
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
