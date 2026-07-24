import { Bookmark, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DataProcessingSectionFilterState } from '../../../lib/data-processing-list-state';
import {
  deleteSavedView,
  loadSavedViews,
  upsertSavedView,
  type DataProcessingSavedView,
} from '../../../lib/data-processing-saved-views';
import { useLanguage } from '../../../i18n/LanguageContext';

interface Props {
  orgId: string;
  section: DataProcessingSavedView['section'];
  filters: DataProcessingSectionFilterState;
  onApply: (filters: Partial<DataProcessingSectionFilterState>) => void;
}

export function DataProcessingSavedViews({ orgId, section, filters, onApply }: Props) {
  const { t } = useLanguage();
  const [views, setViews] = useState<DataProcessingSavedView[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    setViews(loadSavedViews(orgId).filter((v) => v.section === section));
  }, [orgId, section]);

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: DataProcessingSavedView = {
      id: crypto.randomUUID(),
      name: trimmed,
      section,
      filters: {
        q: filters.q,
        status: filters.status,
        kpi: filters.kpi,
        riskLevel: filters.riskLevel,
        dataCategory: filters.dataCategory,
        sort: filters.sort,
        dir: filters.dir,
        limit: filters.limit,
      },
      createdAt: new Date().toISOString(),
    };
    setViews(upsertSavedView(orgId, view).filter((v) => v.section === section));
    setName('');
  };

  const applyView = (view: DataProcessingSavedView) => {
    onApply({
      q: String(view.filters.q ?? ''),
      status: String(view.filters.status ?? ''),
      kpi: (view.filters.kpi as DataProcessingSectionFilterState['kpi']) ?? null,
      riskLevel: String(view.filters.riskLevel ?? ''),
      dataCategory: String(view.filters.dataCategory ?? ''),
      sort: String(view.filters.sort ?? 'updatedAt'),
      dir: view.filters.dir === 'asc' ? 'asc' : 'desc',
      limit: Number(view.filters.limit ?? 25),
      cursor: null,
    });
  };

  const removeView = (viewId: string) => {
    setViews(deleteSavedView(orgId, viewId).filter((v) => v.section === section));
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('dataProcessing.savedViews.namePlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
          aria-label={t('dataProcessing.savedViews.namePlaceholder')}
        />
        <button
          type="button"
          onClick={saveCurrent}
          disabled={!name.trim()}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
        >
          {t('dataProcessing.savedViews.save')}
        </button>
      </div>
      {views.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {views.map((view) => (
            <span key={view.id} className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-[11px]">
              <button type="button" onClick={() => applyView(view)} className="font-semibold hover:underline">
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => removeView(view.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('dataProcessing.savedViews.delete')}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
