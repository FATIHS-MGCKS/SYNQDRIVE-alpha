import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { cn } from '../../../../../components/ui/utils';

type EntityKind = 'vehicles' | 'customers' | 'bookings' | 'stations';

interface EntityOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  orgId: string;
  kind: EntityKind;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  error?: string;
}

function normalizeList<T extends { id?: string; vehicleId?: string }>(
  rows: T[] | { data?: T[] },
  labelFn: (row: T) => string,
  sublabelFn?: (row: T) => string | undefined,
): EntityOption[] {
  const list = Array.isArray(rows) ? rows : rows.data ?? [];
  return list
    .map((row) => {
      const id = String(row.id ?? row.vehicleId ?? '');
      if (!id) return null;
      return {
        id,
        label: labelFn(row),
        sublabel: sublabelFn?.(row),
      };
    })
    .filter((row): row is EntityOption => row != null);
}

export function TenantEntityScopePicker({
  orgId,
  kind,
  selectedIds,
  onChange,
  disabled,
  error,
}: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const search = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (kind === 'vehicles') {
        const res = await api.vehicles.listByOrg(orgId, { limit: 100 });
        const rows = normalizeList(
          res.data ?? [],
          (row: any) => row.licensePlate ?? row.vin ?? row.id,
          (row: any) => [row.make, row.model].filter(Boolean).join(' '),
        );
        const q = query.trim().toLowerCase();
        setOptions(
          q
            ? rows.filter(
                (row) =>
                  row.label.toLowerCase().includes(q) ||
                  row.sublabel?.toLowerCase().includes(q),
              )
            : rows,
        );
      } else if (kind === 'customers') {
        const res = await api.customers.list(orgId, { search: query.trim() || undefined, limit: 50 });
        setOptions(
          normalizeList(
            res.data ?? [],
            (row: any) =>
              [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email || row.id,
            (row: any) => row.email,
          ),
        );
      } else if (kind === 'bookings') {
        const res = await api.bookings.list(orgId, { search: query.trim() || undefined, limit: 50 });
        const rows = Array.isArray(res) ? res : res.data ?? [];
        setOptions(
          normalizeList(
            rows,
            (row: any) => row.bookingNumber ?? row.reference ?? row.id,
            (row: any) => row.customerName ?? row.status,
          ),
        );
      } else {
        const rows = await api.stations.list(orgId, { selectableOnly: true });
        const q = query.trim().toLowerCase();
        const mapped = normalizeList(
          rows,
          (row: any) => row.name ?? row.code ?? row.id,
          (row: any) => row.city,
        );
        setOptions(
          q ? mapped.filter((row) => row.label.toLowerCase().includes(q)) : mapped,
        );
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('dataProcessing.wizard.errors.searchFailed'));
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, kind, query, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((value) => value !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  const selectedOptions = options.filter((option) => selectedSet.has(option.id));

  return (
    <div className="space-y-2" data-testid={`tenant-entity-picker-${kind}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder={t(`dataProcessing.wizard.entitySearch.${kind}`)}
          className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[var(--brand-soft)]"
          aria-label={t(`dataProcessing.wizard.entitySearch.${kind}`)}
        />
      </div>

      {loadError ? <p className="text-[11px] text-destructive">{loadError}</p> : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const option = selectedOptions.find((row) => row.id === id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand)]/30 bg-[var(--brand-soft)] px-2 py-1 text-[11px] font-medium text-[var(--brand)]"
              >
                <span>{option?.label ?? id.slice(0, 8)}</span>
                <X className="h-3 w-3" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className="max-h-44 overflow-y-auto rounded-xl border border-border/70"
        role="listbox"
        aria-multiselectable="true"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('dataProcessing.wizard.entitySearch.loading')}
          </div>
        ) : options.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">{t('dataProcessing.wizard.entitySearch.empty')}</p>
        ) : (
          options.map((option) => {
            const active = selectedSet.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                disabled={disabled}
                onClick={() => toggle(option.id)}
                className={cn(
                  'flex w-full items-start justify-between gap-2 border-b border-border/50 px-3 py-2 text-left text-xs last:border-b-0',
                  active ? 'bg-[var(--brand-soft)]/40' : 'hover:bg-muted/50',
                )}
              >
                <span>
                  <span className="font-medium text-foreground">{option.label}</span>
                  {option.sublabel ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{option.sublabel}</span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
