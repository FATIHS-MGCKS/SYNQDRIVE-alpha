import { useMemo, useState } from 'react';
import { Briefcase, Search, Star, X } from 'lucide-react';
import type { Vendor, VendorCategory } from '../../../lib/api';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import { preferredVendorsForVehicle } from '../../lib/service-task-semantics';

const VENDOR_CATEGORIES: VendorCategory[] = [
  'WORKSHOP',
  'SERVICE_PARTNER',
  'TIRE_DEALER',
  'TUV_STATION',
  'BODY_REPAIR',
  'PAINT_SHOP',
  'AUTO_GLASS',
  'DETAILING',
  'OTHER',
];

function vendorCategoryLabel(t: (key: TranslationKey) => string, category: VendorCategory): string {
  return t(`tasks.vendor.category.${category}` as TranslationKey);
}

interface TaskVendorPickerProps {
  vendors: Vendor[];
  value: string | null;
  onChange: (vendorId: string | null) => void;
  vehicleId?: string | null;
  disabled?: boolean;
}

export function TaskVendorPicker({
  vendors,
  value,
  onChange,
  vehicleId,
  disabled,
}: TaskVendorPickerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<VendorCategory | 'ALL'>('ALL');
  const [serviceArea, setServiceArea] = useState<string>('ALL');

  const selected = vendors.find((v) => v.id === value) ?? null;

  const serviceAreas = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) {
      for (const a of v.serviceAreas ?? []) {
        if (a.trim()) set.add(a.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [vendors]);

  const preferred = useMemo(
    () => preferredVendorsForVehicle(vendors, vehicleId),
    [vendors, vehicleId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => v.isActive !== false)
      .filter((v) => category === 'ALL' || v.category === category)
      .filter((v) => serviceArea === 'ALL' || v.serviceAreas?.includes(serviceArea))
      .filter((v) => {
        if (!q) return true;
        return [v.name, v.city, v.category, ...(v.serviceAreas ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 40);
  }, [vendors, search, category, serviceArea]);

  const inputClass =
    'w-full rounded-xl border border-border bg-[color:var(--input-background)] px-3 py-2 text-[12px] outline-none focus:border-[color:var(--brand)]';

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('tasks.vendor.label')}
      </label>

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
          <div className="min-w-0 flex items-center gap-2">
            <Briefcase className="w-4 h-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold truncate">{selected.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {vendorCategoryLabel(t, selected.category)}
                {selected.city ? ` · ${selected.city}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
            title={t('tasks.vendor.remove')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-center">
          <p className="text-[11px] text-muted-foreground">{t('tasks.vendor.noneSelected')}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className="mt-2 text-[11px] font-semibold text-[color:var(--brand-ink)] hover:underline"
          >
            {t('tasks.vendor.search')}
          </button>
        </div>
      )}

      {(open || selected) && !selected && (
        <div className="rounded-xl border border-border/50 surface-premium p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tasks.vendor.searchPlaceholder')}
              className={`${inputClass} pl-8`}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as VendorCategory | 'ALL')}
              className="rounded-lg border border-border px-2 py-1 text-[10px] bg-[color:var(--input-background)]"
              disabled={disabled}
            >
              <option value="ALL">{t('tasks.vendor.allCategories')}</option>
              {VENDOR_CATEGORIES.map((k) => (
                <option key={k} value={k}>{vendorCategoryLabel(t, k)}</option>
              ))}
            </select>
            {serviceAreas.length > 0 && (
              <select
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                className="rounded-lg border border-border px-2 py-1 text-[10px] bg-[color:var(--input-background)]"
                disabled={disabled}
              >
                <option value="ALL">{t('tasks.vendor.allServiceAreas')}</option>
                {serviceAreas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
          </div>

          {preferred.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                <Star className="w-3 h-3" /> {t('tasks.vendor.preferred')}
              </p>
              <div className="flex flex-wrap gap-1">
                {preferred.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-40 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">{t('tasks.vendor.noneFound')}</p>
            ) : (
              filtered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(v.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="w-full text-left rounded-lg px-2 py-2 hover:bg-muted/40 border border-transparent hover:border-border/40"
                >
                  <p className="text-[11px] font-medium">{v.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {vendorCategoryLabel(t, v.category)}
                    {v.serviceAreas?.length ? ` · ${v.serviceAreas.slice(0, 2).join(', ')}` : ''}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setOpen(true);
          }}
          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
        >
          {t('tasks.vendor.change')}
        </button>
      )}
    </div>
  );
}
