import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoicePlanCatalogEntry, VoicePlanCode, VoiceUsageSummary } from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';

interface VoiceWizardPlanStepProps {
  orgId: string;
  selectedPlan: VoicePlanCode | null;
  onPlanSelected: (planCode: VoicePlanCode) => void;
  saving: boolean;
}

export function VoiceWizardPlanStep({
  orgId,
  selectedPlan,
  onPlanSelected,
  saving,
}: VoiceWizardPlanStepProps) {
  const { t, locale } = useLanguage();
  const moneyLocale = locale === 'de' ? 'de-DE' : 'en-US';
  const [plans, setPlans] = useState<VoicePlanCatalogEntry[]>([]);
  const [usage, setUsage] = useState<VoiceUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<VoicePlanCode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, usageSummary] = await Promise.all([
        api.voiceAssistant.billing.plans(orgId),
        api.voiceAssistant.billing.usage(orgId),
      ]);
      setPlans(planList);
      setUsage(usageSummary);
    } catch (err) {
      setError(getErrorMessage(err, t('voice.plan.loadError')));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = async (code: VoicePlanCode) => {
    if (saving || selecting) return;
    setSelecting(code);
    setError(null);
    try {
      await api.voiceAssistant.billing.selectPlan(orgId, code);
      onPlanSelected(code);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('voice.plan.selectError')));
    } finally {
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Icon name="loader-2" className="h-4 w-4 animate-spin" />
        {t('voice.common.loading')}
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className="surface-premium rounded-2xl border border-[color:var(--status-critical)]/20 p-5 text-center">
        <p className="text-sm font-semibold text-foreground">{t('voice.plan.loadError')}</p>
        <p className="mt-2 text-xs text-muted-foreground">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-lg border px-4 py-2 text-xs font-semibold">
          {t('voice.common.retry')}
        </button>
      </div>
    );
  }

  const activePlan = selectedPlan ?? usage?.planCode ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold tracking-[-0.02em] text-foreground">{t('voice.plan.title')}</h3>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
          {t('voice.plan.description')}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-[color:var(--status-critical)]/20 bg-[color:var(--status-critical)]/5 px-3 py-2 text-[11px] text-[color:var(--status-critical)]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {plans.map(plan => {
          const selected = activePlan === plan.code;
          const busy = selecting === plan.code || (saving && selected);
          return (
            <button
              key={plan.code}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void handleSelect(plan.code)}
              className={cn(
                'surface-premium sq-press rounded-2xl border p-4 text-left shadow-[var(--shadow-1)] transition-colors',
                selected
                  ? 'border-[color:var(--brand)]/40 ring-1 ring-[color:var(--brand)]/15'
                  : 'border-border/40 hover:border-[color:var(--brand)]/25',
              )}
              aria-pressed={selected}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-bold text-foreground">{t(`voice.plan.${plan.code.toLowerCase()}` as 'voice.plan.start')}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {formatMoneyCents(plan.monthlyFeeCents, plan.currency, moneyLocale)}
                    <span className="text-[10px] font-medium text-muted-foreground"> / {t('voice.plan.month')}</span>
                  </p>
                </div>
                {selected && (
                  <StatusChip tone="success" className="text-[9px]">
                    {t('voice.plan.selected')}
                  </StatusChip>
                )}
              </div>

              <dl className="mt-4 space-y-1.5 text-[10px] text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>{t('voice.plan.includedMinutes')}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {plan.entitlements.includedMinutesPerMonth}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('voice.plan.overage')}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatMoneyCents(plan.entitlements.overageCentsPerMinute, plan.currency, moneyLocale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('voice.plan.numbers')}</dt>
                  <dd className="font-semibold text-foreground">{plan.entitlements.localPhoneNumbers}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('voice.plan.locations')}</dt>
                  <dd className="font-semibold text-foreground">
                    {plan.entitlements.maxBranches == null
                      ? t('voice.plan.unlimited')
                      : plan.entitlements.maxBranches}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t('voice.plan.parallel')}</dt>
                  <dd className="font-semibold text-foreground">{plan.entitlements.maxConcurrentCalls}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-border/30 pt-2">
                  <dt>{t('voice.plan.setupFee')}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatMoneyCents(plan.setupFeeCents, plan.currency, moneyLocale)}
                  </dd>
                </div>
              </dl>

              {busy && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Icon name="loader-2" className="h-3 w-3 animate-spin" />
                  {t('voice.common.saving')}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
