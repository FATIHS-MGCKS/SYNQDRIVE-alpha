import { useState } from 'react';
import { Car, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import { EmptyState, SectionHeader } from '../../../../components/patterns';
import { api } from '../../../../lib/api';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { RentalRulesOverviewDto } from './rental-rules.types';
import { formatRuleValue, labelRuleField } from './rental-rules.utils';
import { RentalRequirementsStatusBadge } from '../../shared/rental-requirements-ui';

interface RentalRulesOverridesSectionProps {
  orgId: string | null;
  overview: RentalRulesOverviewDto | null;
  canManageOverrides: boolean;
  onPreviewVehicle: (vehicleId: string, label: string) => void;
  onReload: () => Promise<void> | void;
}

export function RentalRulesOverridesSection({
  orgId,
  overview,
  canManageOverrides,
  onPreviewVehicle,
  onReload,
}: RentalRulesOverridesSectionProps) {
  const { t, locale } = useLanguage();
  const [resettingId, setResettingId] = useState<string | null>(null);
  const rows = overview?.overrideVehicles ?? [];

  const handleReset = async (vehicleId: string) => {
    if (!orgId || !canManageOverrides) return;
    setResettingId(vehicleId);
    try {
      await api.rentalRules.resetVehicleOverrides(orgId, vehicleId);
      toast.success(t('rentalRules.workflow.overrides.resetSuccess'));
      await onReload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rentalRules.workflow.overrides.resetFailed'));
    } finally {
      setResettingId(null);
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t('rentalRules.ui.sections.overrides')}
        description={t('rentalRules.workflow.overrides.description')}
      />

      <div className="surface-premium overflow-hidden rounded-2xl border border-border/70">
        {rows.length === 0 ? (
          <div className="p-3 sm:p-4">
            <EmptyState
              compact
              icon={<Car className="h-5 w-5" />}
              title={t('rentalRules.ui.overrides.emptyTitle')}
              description={t('rentalRules.ui.overrides.emptyDescription')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead className="border-b border-border/60 bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">{t('rentalRules.workflow.overrides.vehicle')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">{t('rentalRules.workflow.overrides.category')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">{t('rentalRules.workflow.overrides.fields')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">{t('rentalRules.workflow.overrides.reason')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">{t('rentalRules.workflow.overrides.createdBy')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">{t('rentalRules.workflow.overrides.validity')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">{t('rentalRules.workflow.overrides.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.vehicleId} className="border-b border-border/40 align-top">
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-foreground">
                          {row.licensePlate || '—'} · {row.displayName}
                        </p>
                        <RentalRequirementsStatusBadge kind="vehicle-override" />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.categoryName ?? t('rentalRules.ui.overrides.missingCategory')}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <ul className="space-y-0.5">
                        {(row.overrideFields ?? (row.topOverrideField ? [row.topOverrideField] : [])).map((field) => (
                          <li key={field}>
                            {labelRuleField(field)}: {formatRuleValue(field, row.topOverrideField === field ? row.topOverrideValue : null)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{row.changeReason ?? '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.createdByName ?? t('rentalRules.ui.history.systemActor')}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.validFrom
                        ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(row.validFrom))
                        : '—'}
                      {row.validTo
                        ? ` → ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(row.validTo))}`
                        : ''}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <Button
                          type="button"
                          variant="neutral"
                          size="sm"
                          onClick={() => onPreviewVehicle(row.vehicleId, row.displayName)}
                        >
                          {t('rentalRules.ui.overrides.viewEffective')}
                        </Button>
                        {canManageOverrides ? (
                          <Button
                            type="button"
                            variant="neutral"
                            size="sm"
                            disabled={resettingId === row.vehicleId}
                            onClick={() => void handleReset(row.vehicleId)}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                            {t('rentalRules.workflow.overrides.resetToCategory')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
