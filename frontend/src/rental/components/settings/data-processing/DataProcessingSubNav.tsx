import { cn } from '../../../../components/ui/utils';
import { useRovingTablist } from '../../../../hooks/useRovingTablist';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { DataProcessingSectionId } from './data-processing.constants';
import { DP_SECTION_PANEL_ID, DP_SECTION_TAB_ID } from './data-processing-a11y';

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

  const { getTabProps } = useRovingTablist({
    items: visibleSections,
    activeId: active,
    onActivate: onChange,
    getItemId: (section) => DP_SECTION_TAB_ID[section],
    getPanelId: (section) => DP_SECTION_PANEL_ID[section],
    orientation: 'horizontal',
  });

  return (
    <div
      role="tablist"
      aria-label={t('dataProcessing.subnav.label')}
      aria-orientation="horizontal"
      className="surface-frosted flex gap-1 overflow-x-auto rounded-2xl border border-border/60 p-1"
    >
      {visibleSections.map((section, index) => {
        const isActive = active === section;
        const tabProps = getTabProps(section, index);
        const { ref, onKeyDown, onFocus, onClick, ...restTabProps } = tabProps;

        return (
          <button
            key={section}
            type="button"
            {...restTabProps}
            ref={ref}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onClick={onClick}
            className={cn(
              'min-h-11 shrink-0 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
