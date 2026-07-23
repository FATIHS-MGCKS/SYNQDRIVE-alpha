import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { RentalRulesSectionId } from './rental-rules-matrix.utils';

const SECTIONS: RentalRulesSectionId[] = [
  'overview',
  'organization',
  'categories',
  'overrides',
  'history',
];

interface RentalRulesSubNavProps {
  active: RentalRulesSectionId;
  onChange: (section: RentalRulesSectionId) => void;
  draftCount: number;
}

export function RentalRulesSubNav({ active, onChange, draftCount }: RentalRulesSubNavProps) {
  const { t } = useLanguage();

  return (
    <div
      role="tablist"
      aria-label={t('rentalRules.ui.subnav.label')}
      className="surface-frosted flex gap-1 overflow-x-auto rounded-2xl border border-border/60 p-1"
    >
      {SECTIONS.map((section) => {
        const isActive = active === section;
        const showDraftBadge = section === 'organization' && draftCount > 0;
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
            <span className="inline-flex items-center gap-2">
              {t(`rentalRules.ui.sections.${section}`)}
              {showDraftBadge ? (
                <span className="rounded-full bg-[color:var(--status-watch)]/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--status-watch)]">
                  {draftCount}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
