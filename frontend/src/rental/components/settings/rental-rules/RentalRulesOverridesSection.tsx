import { Car } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { EmptyState, SectionHeader } from '../../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { RentalRulesOverviewDto } from './rental-rules.types';
import { formatRuleValue, labelRuleField } from './rental-rules.utils';
import { RentalRequirementsStatusBadge } from '../../shared/rental-requirements-ui';

interface RentalRulesOverridesSectionProps {
  overview: RentalRulesOverviewDto | null;
  onPreviewVehicle: (vehicleId: string, label: string) => void;
}

export function RentalRulesOverridesSection({
  overview,
  onPreviewVehicle,
}: RentalRulesOverridesSectionProps) {
  const { t } = useLanguage();
  const rows = overview?.overrideVehicles ?? [];

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t('rentalRules.ui.sections.overrides')}
        description={t('rentalRules.ui.overrides.description')}
      />

      <div className="surface-premium rounded-2xl border border-border/70 p-3 sm:p-4">
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={<Car className="h-5 w-5" />}
            title={t('rentalRules.ui.overrides.emptyTitle')}
            description={t('rentalRules.ui.overrides.emptyDescription')}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.vehicleId}
                className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13px] font-semibold text-foreground">
                      {row.licensePlate || '—'} · {row.displayName}
                    </p>
                    <RentalRequirementsStatusBadge kind="vehicle-override" />
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {row.categoryName
                      ? t('rentalRules.ui.overrides.category', { name: row.categoryName })
                      : t('rentalRules.ui.overrides.missingCategory')}
                    {' · '}
                    {t('rentalRules.ui.overrides.overrideCount', { count: row.overrideCount })}
                    {row.topOverrideField
                      ? ` · ${labelRuleField(row.topOverrideField)}: ${formatRuleValue(row.topOverrideField, row.topOverrideValue)}`
                      : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onPreviewVehicle(row.vehicleId, row.displayName)}
                >
                  {t('rentalRules.ui.overrides.viewEffective')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
