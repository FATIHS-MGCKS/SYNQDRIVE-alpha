import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type {
  ExtraOptionRow,
  InsuranceOptionRow,
  MileagePackageOption,
  PriceOptionPricingType,
} from '../../../pricing/pricingTypes';
import { grossMajorFromNetCents, netPreviewFromGrossInput } from '../../../pricing/tariff-live-draft-compare';

interface TariffOptionsEditorProps {
  inputClassName: string;
  taxRate: number;
  currency: string | null;
  insurances: InsuranceOptionRow[];
  extras: ExtraOptionRow[];
  packages: MileagePackageOption[];
  onInsurancesChange: (next: InsuranceOptionRow[]) => void;
  onExtrasChange: (next: ExtraOptionRow[]) => void;
  onPackagesChange: (next: MileagePackageOption[]) => void;
}

function nextSortOrder<T extends { sortOrder: number }>(items: T[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.sortOrder)) + 1;
}

function PricingTypeSelect({
  value,
  onChange,
  className,
}: {
  value: PriceOptionPricingType;
  onChange: (value: PriceOptionPricingType) => void;
  className: string;
}) {
  const { t } = useLanguage();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as PriceOptionPricingType)} className={className}>
      <option value="PER_DAY">{t('priceTariffs.extras.perDay')}</option>
      <option value="PER_BOOKING">{t('priceTariffs.extras.perBooking')}</option>
    </select>
  );
}

function GrossPriceInput({
  netCents,
  taxRate,
  onNetCentsChange,
  className,
}: {
  netCents: number;
  taxRate: number;
  onNetCentsChange: (cents: number) => void;
  className: string;
}) {
  const grossMajor = grossMajorFromNetCents(netCents, taxRate);
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={Number.isFinite(grossMajor) ? grossMajor.toFixed(2) : '0.00'}
      onChange={(e) => onNetCentsChange(netPreviewFromGrossInput(parseFloat(e.target.value || '0'), taxRate))}
      className={cn(className, 'tabular-nums')}
    />
  );
}

export function TariffOptionsEditor({
  inputClassName,
  taxRate,
  currency,
  insurances,
  extras,
  packages,
  onInsurancesChange,
  onExtrasChange,
  onPackagesChange,
}: TariffOptionsEditorProps) {
  const { t } = useLanguage();

  const addInsurance = () => {
    onInsurancesChange([
      ...insurances,
      {
        id: '',
        label: '',
        description: '',
        priceCents: 0,
        pricingType: 'PER_DAY',
        deductibleCents: null,
        isDefault: false,
        isActive: true,
        sortOrder: nextSortOrder(insurances),
      },
    ]);
  };

  const addExtra = () => {
    onExtrasChange([
      ...extras,
      {
        id: '',
        label: '',
        description: '',
        priceCents: 0,
        pricingType: 'PER_DAY',
        isActive: true,
        sortOrder: nextSortOrder(extras),
      },
    ]);
  };

  const addPackage = () => {
    onPackagesChange([
      ...packages,
      {
        id: '',
        label: '',
        includedKm: 500,
        priceCents: 0,
        isActive: true,
        sortOrder: nextSortOrder(packages),
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('priceTariffs.extras.insurance')}
          </h4>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-[11px]" onClick={addInsurance}>
            <Plus className="h-3.5 w-3.5" />
            {t('priceTariffs.editor.optionsAdd')}
          </Button>
        </div>
        {insurances.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            {t('priceTariffs.extras.noneConfigured')}
          </p>
        ) : (
          <ul className="space-y-2">
            {insurances.map((option, index) => (
              <li key={option.id || `insurance-new-${index}`} className="rounded-lg border border-border/40 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.label')}
                    </span>
                    <input
                      value={option.label}
                      onChange={(e) => {
                        const next = [...insurances];
                        next[index] = { ...option, label: e.target.value };
                        onInsurancesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.description')}
                    </span>
                    <input
                      value={option.description ?? ''}
                      onChange={(e) => {
                        const next = [...insurances];
                        next[index] = { ...option, description: e.target.value };
                        onInsurancesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.price')}
                      {currency ? ` (${currency})` : ''}
                    </span>
                    <GrossPriceInput
                      netCents={option.priceCents}
                      taxRate={taxRate}
                      onNetCentsChange={(priceCents) => {
                        const next = [...insurances];
                        next[index] = { ...option, priceCents };
                        onInsurancesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.pricingType')}
                    </span>
                    <PricingTypeSelect
                      value={option.pricingType}
                      onChange={(pricingType) => {
                        const next = [...insurances];
                        next[index] = { ...option, pricingType };
                        onInsurancesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.deductible')}
                      {currency ? ` (${currency})` : ''}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={((option.deductibleCents ?? 0) / 100).toFixed(2)}
                      onChange={(e) => {
                        const next = [...insurances];
                        next[index] = {
                          ...option,
                          deductibleCents: Math.round(parseFloat(e.target.value || '0') * 100),
                        };
                        onInsurancesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1 tabular-nums')}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={option.isActive}
                        onChange={(e) => {
                          const next = [...insurances];
                          next[index] = { ...option, isActive: e.target.checked };
                          onInsurancesChange(next);
                        }}
                      />
                      {t('priceTariffs.editor.optionsFields.active')}
                    </label>
                    <label className="flex items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={option.isDefault}
                        onChange={(e) => {
                          const next = insurances.map((row, rowIndex) => ({
                            ...row,
                            isDefault: rowIndex === index ? e.target.checked : false,
                          }));
                          onInsurancesChange(next);
                        }}
                      />
                      {t('priceTariffs.editor.optionsFields.default')}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 gap-1 text-[11px] text-[color:var(--status-critical)]"
                      onClick={() => onInsurancesChange(insurances.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('priceTariffs.editor.optionsRemove')}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('priceTariffs.extras.extras')}
          </h4>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-[11px]" onClick={addExtra}>
            <Plus className="h-3.5 w-3.5" />
            {t('priceTariffs.editor.optionsAdd')}
          </Button>
        </div>
        {extras.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            {t('priceTariffs.extras.noneConfigured')}
          </p>
        ) : (
          <ul className="space-y-2">
            {extras.map((option, index) => (
              <li key={option.id || `extra-new-${index}`} className="rounded-lg border border-border/40 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.label')}
                    </span>
                    <input
                      value={option.label}
                      onChange={(e) => {
                        const next = [...extras];
                        next[index] = { ...option, label: e.target.value };
                        onExtrasChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.description')}
                    </span>
                    <input
                      value={option.description ?? ''}
                      onChange={(e) => {
                        const next = [...extras];
                        next[index] = { ...option, description: e.target.value };
                        onExtrasChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.price')}
                      {currency ? ` (${currency})` : ''}
                    </span>
                    <GrossPriceInput
                      netCents={option.priceCents}
                      taxRate={taxRate}
                      onNetCentsChange={(priceCents) => {
                        const next = [...extras];
                        next[index] = { ...option, priceCents };
                        onExtrasChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.pricingType')}
                    </span>
                    <PricingTypeSelect
                      value={option.pricingType}
                      onChange={(pricingType) => {
                        const next = [...extras];
                        next[index] = { ...option, pricingType };
                        onExtrasChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={option.isActive}
                        onChange={(e) => {
                          const next = [...extras];
                          next[index] = { ...option, isActive: e.target.checked };
                          onExtrasChange(next);
                        }}
                      />
                      {t('priceTariffs.editor.optionsFields.active')}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 gap-1 text-[11px] text-[color:var(--status-critical)]"
                      onClick={() => onExtrasChange(extras.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('priceTariffs.editor.optionsRemove')}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('priceTariffs.extras.mileage')}
          </h4>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-[11px]" onClick={addPackage}>
            <Plus className="h-3.5 w-3.5" />
            {t('priceTariffs.editor.optionsAdd')}
          </Button>
        </div>
        {packages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            {t('priceTariffs.extras.noneConfigured')}
          </p>
        ) : (
          <ul className="space-y-2">
            {packages.map((pkg, index) => (
              <li key={pkg.id || `package-new-${index}`} className="rounded-lg border border-border/40 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.label')}
                    </span>
                    <input
                      value={pkg.label}
                      onChange={(e) => {
                        const next = [...packages];
                        next[index] = { ...pkg, label: e.target.value };
                        onPackagesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.includedKm')}
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={pkg.includedKm}
                      onChange={(e) => {
                        const next = [...packages];
                        next[index] = { ...pkg, includedKm: parseInt(e.target.value || '0', 10) };
                        onPackagesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1 tabular-nums')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('priceTariffs.editor.optionsFields.price')}
                      {currency ? ` (${currency})` : ''}
                    </span>
                    <GrossPriceInput
                      netCents={pkg.priceCents}
                      taxRate={taxRate}
                      onNetCentsChange={(priceCents) => {
                        const next = [...packages];
                        next[index] = { ...pkg, priceCents };
                        onPackagesChange(next);
                      }}
                      className={cn(inputClassName, 'mt-1')}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={pkg.isActive}
                        onChange={(e) => {
                          const next = [...packages];
                          next[index] = { ...pkg, isActive: e.target.checked };
                          onPackagesChange(next);
                        }}
                      />
                      {t('priceTariffs.editor.optionsFields.active')}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 gap-1 text-[11px] text-[color:var(--status-critical)]"
                      onClick={() => onPackagesChange(packages.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('priceTariffs.editor.optionsRemove')}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
