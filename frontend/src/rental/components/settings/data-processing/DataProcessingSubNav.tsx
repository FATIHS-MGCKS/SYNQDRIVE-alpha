import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { DataProcessingSectionId } from './data-processing.constants';

interface DataProcessingSubNavProps {
  active: DataProcessingSectionId;
  onChange: (section: DataProcessingSectionId) => void;
  visibleSections: DataProcessingSectionId[];
}

export function DataProcessingSubNav({
  active,
  onChange,
  visibleSections,
}: DataProcessingSubNavProps) {
  const { t } = useLanguage();

  return (
    <div
      role="tablist"
      aria-label={t('dataProcessing.subnav.label')}
      className="surface-frosted flex gap-1 overflow-x-auto rounded-2xl border border-border/60 p-1"
    >
      {visibleSections.map((section) => {
        const isActive = active === section;
        return (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(section)}
            className={cn(
              'min-h-11 shrink-0 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
              isActive
                ? 'surface-premium text-foreground shadow-[var(--shadow-xs)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`dataProcessing.sections.${section}`)}
          </button>
        );
      })}
    </div>
  );
}
