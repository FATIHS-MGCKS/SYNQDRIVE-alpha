import { EVALUATIONS_SECTION_IDS, EVALUATIONS_SECTION_ORDER } from './evaluations-page.constants';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';
import type { TranslationKey } from '../../i18n/translations/en';

const NAV_KEYS: Record<string, TranslationKey> = {
  [EVALUATIONS_SECTION_IDS.filters]: 'evaluations.ia.nav.filters',
  [EVALUATIONS_SECTION_IDS.executive]: 'evaluations.ia.nav.executive',
  [EVALUATIONS_SECTION_IDS.strengthsWeaknesses]: 'evaluations.ia.nav.strengthsWeaknesses',
  [EVALUATIONS_SECTION_IDS.risks]: 'evaluations.ia.nav.risks',
  [EVALUATIONS_SECTION_IDS.finance]: 'evaluations.ia.nav.finance',
  [EVALUATIONS_SECTION_IDS.fleet]: 'evaluations.ia.nav.fleet',
  [EVALUATIONS_SECTION_IDS.costsDowntime]: 'evaluations.ia.nav.costsDowntime',
  [EVALUATIONS_SECTION_IDS.actions]: 'evaluations.ia.nav.actions',
  [EVALUATIONS_SECTION_IDS.dataQuality]: 'evaluations.ia.nav.dataQuality',
};

interface EvaluationsSectionNavProps {
  className?: string;
}

export function EvaluationsSectionNav({ className }: EvaluationsSectionNavProps) {
  const { t } = useLanguage();

  return (
    <nav
      aria-label={t('evaluations.ia.nav.label')}
      className={cn(
        'sticky top-0 z-20 -mx-1 mb-1 overflow-x-auto rounded-xl border border-border/40 bg-background/85 px-2 py-2 backdrop-blur-md',
        className,
      )}
    >
      <ul className="flex min-w-max items-center gap-1.5">
        {EVALUATIONS_SECTION_ORDER.map((sectionId) => (
          <li key={sectionId}>
            <a
              href={`#${sectionId}`}
              className="inline-flex rounded-lg px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
            >
              {t(NAV_KEYS[sectionId])}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
