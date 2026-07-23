import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Car,
  ClipboardCheck,
  Layers,
  Upload,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { StatusChip, type StatusTone } from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { fhs } from '../../fleet-health-service/fleet-health-service-shell';
import { RuleInheritanceSteps } from '../../shared/rental-requirements-ui';
import type { RentalRulesKpiSnapshot, RentalRulesSectionId } from './rental-rules-matrix.utils';

const RULE_HIERARCHY_STEPS = [
  { key: 'org', label: 'Organization defaults', labelDe: 'Organisationsstandard' },
  { key: 'category', label: 'Vehicle category', labelDe: 'Fahrzeugkategorie' },
  { key: 'override', label: 'Vehicle override', labelDe: 'Fahrzeug-Override' },
  { key: 'effective', label: 'Effective requirements', labelDe: 'Effektive Anforderungen' },
] as const;

interface RentalRulesOverviewPanelProps {
  kpis: RentalRulesKpiSnapshot;
  rulesActive: boolean;
  localeCode: string;
  onNavigate: (section: RentalRulesSectionId) => void;
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: StatusTone;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'critical' || tone === 'warning'
      ? fhs.kpiCardCritical
      : tone === 'success'
        ? fhs.kpiCardSuccess
        : '';

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={fhs.kpiTitle}>{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </div>
      <p className={cn(fhs.kpiNumber, 'mt-1')}>{value}</p>
      <p className={cn(fhs.kpiHint, 'mt-1')}>{hint}</p>
    </>
  );

  if (!onClick) {
    return <div className={cn(fhs.kpiCard, toneClass)}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={cn(fhs.kpiCard, toneClass, 'w-full text-left')}>
      {body}
    </button>
  );
}

export function RentalRulesOverviewPanel({
  kpis,
  rulesActive,
  localeCode,
  onNavigate,
}: RentalRulesOverviewPanelProps) {
  const { t } = useLanguage();

  const cards: Array<{
    label: string;
    value: string | number;
    hint: string;
    tone: StatusTone;
    icon: LucideIcon;
    section?: RentalRulesSectionId;
  }> = [
    {
      label: t('rentalRules.ui.kpi.orgComplete'),
      value: kpis.orgDefaultsComplete ? t('rentalRules.ui.kpi.yes') : t('rentalRules.ui.kpi.no'),
      hint: t('rentalRules.ui.kpi.orgCompleteHint'),
      tone: kpis.orgDefaultsComplete ? 'success' : 'warning',
      icon: ClipboardCheck,
      section: 'organization',
    },
    {
      label: t('rentalRules.ui.kpi.activeCategories'),
      value: kpis.activeCategories,
      hint: t('rentalRules.ui.kpi.activeCategoriesHint'),
      tone: 'neutral',
      icon: Layers,
      section: 'categories',
    },
    {
      label: t('rentalRules.ui.kpi.unassignedVehicles'),
      value: kpis.vehiclesWithoutCategory,
      hint: t('rentalRules.ui.kpi.unassignedVehiclesHint'),
      tone: kpis.vehiclesWithoutCategory > 0 ? 'warning' : 'success',
      icon: Car,
      section: 'categories',
    },
    {
      label: t('rentalRules.ui.kpi.overrideVehicles'),
      value: kpis.vehiclesWithOverride,
      hint: t('rentalRules.ui.kpi.overrideVehiclesHint'),
      tone: kpis.vehiclesWithOverride > 0 ? 'warning' : 'neutral',
      icon: Car,
      section: 'overrides',
    },
    {
      label: t('rentalRules.ui.kpi.incompleteRules'),
      value: kpis.incompleteRules,
      hint: t('rentalRules.ui.kpi.incompleteRulesHint'),
      tone: kpis.incompleteRules > 0 ? 'critical' : 'success',
      icon: AlertTriangle,
      section: 'categories',
    },
    {
      label: t('rentalRules.ui.kpi.unpublishedChanges'),
      value: kpis.unpublishedChanges,
      hint: t('rentalRules.ui.kpi.unpublishedChangesHint'),
      tone: kpis.unpublishedChanges > 0 ? 'watch' : 'success',
      icon: Upload,
      section: 'organization',
    },
  ];

  return (
    <div className="space-y-4">
      <section className="surface-premium rounded-2xl border border-border/70 p-3 sm:p-4">
        <RuleInheritanceSteps
          steps={RULE_HIERARCHY_STEPS}
          activeStep="effective"
          rulesActive={rulesActive}
          locale={localeCode.startsWith('de') ? 'de' : 'en'}
        />
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          {t('rentalRules.ui.inheritanceHint')}
        </p>
      </section>

      <div className={cn(fhs.kpiGrid, 'lg:grid-cols-3')}>
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            tone={card.tone}
            icon={card.icon}
            onClick={card.section ? () => onNavigate(card.section!) : undefined}
          />
        ))}
      </div>

      {kpis.unpublishedChanges > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <StatusChip tone="watch" dot>
              {t('rentalRules.ui.draftBanner.title')}
            </StatusChip>
            <p className="text-[12px] text-muted-foreground">{t('rentalRules.ui.draftBanner.body')}</p>
          </div>
          <Button type="button" variant="neutral" size="sm" onClick={() => onNavigate('organization')}>
            {t('rentalRules.ui.draftBanner.action')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
