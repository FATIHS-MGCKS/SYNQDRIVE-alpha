import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  VoiceConfirmationDialog,
  VoiceInlineNotice,
  VoiceSectionHeader,
  VoiceSkeleton,
} from '../../../components/voice-ui';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoicePlanCatalogEntry,
  VoicePlanCode,
  VoiceSubscriptionResponse,
} from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import {
  buildPlanComparisonRows,
  isPlanChangeSelection,
  RECOMMENDED_VOICE_PLAN,
} from './voice-plan-onboarding.ops';

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
  const [subscription, setSubscription] = useState<VoiceSubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<VoicePlanCode | null>(null);
  const [pendingSelection, setPendingSelection] = useState<VoicePlanCode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planList, sub] = await Promise.all([
        api.voiceAssistant.billing.plans(orgId),
        api.voiceAssistant.billing.subscription(orgId),
      ]);
      setPlans(planList);
      setSubscription(sub);
    } catch (err) {
      setError(getErrorMessage(err, t('voice.plan.loadError')));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activePlan =
    selectedPlan ??
    subscription?.subscription?.planCode ??
    subscription?.plan?.code ??
    null;

  const pendingPlan = subscription?.subscription?.pendingPlanCode ?? null;
  const pendingEffectiveAt = subscription?.subscription?.pendingPlanEffectiveAt ?? null;

  const comparisonRows = useMemo(
    () =>
      buildPlanComparisonRows(plans, {
        unlimited: t('voice.plan.unlimited'),
        includedMinutes: t('voice.plan.includedMinutes'),
        overage: t('voice.plan.overage'),
        numbers: t('voice.plan.numbers'),
        locations: t('voice.plan.locations'),
        parallel: t('voice.plan.parallel'),
        setupFee: t('voice.plan.setupFee'),
        languages: t('voice.plan.languages'),
      }, moneyLocale),
    [plans, t, moneyLocale],
  );

  const confirmPlanSelection = async (code: VoicePlanCode) => {
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
      setPendingSelection(null);
    }
  };

  const handleSelectClick = (code: VoicePlanCode) => {
    if (activePlan === code && !pendingPlan) return;
    if (isPlanChangeSelection(activePlan, code)) {
      setPendingSelection(code);
      return;
    }
    void confirmPlanSelection(code);
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <VoiceSkeleton variant="hero" />
        <VoiceSkeleton variant="metrics" />
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <VoiceInlineNotice tone="blocked" title={t('voice.plan.loadError')}>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border px-4 py-2 text-xs font-semibold"
        >
          {t('voice.common.retry')}
        </button>
      </VoiceInlineNotice>
    );
  }

  return (
    <div className="space-y-5">
      <VoiceSectionHeader
        title={t('voice.plan.title')}
        description={t('voice.plan.description')}
      />

      <VoiceInlineNotice tone="info" title={t('voice.plan.netPriceNoteTitle')}>
        {t('voice.plan.netPriceNote')}
      </VoiceInlineNotice>

      {activePlan && (
        <VoiceInlineNotice tone="success" title={t('voice.plan.currentPlanTitle')}>
          {t('voice.plan.currentPlan', {
            plan: t(`voice.plan.${activePlan.toLowerCase()}` as 'voice.plan.start'),
          })}
        </VoiceInlineNotice>
      )}

      {pendingPlan && pendingEffectiveAt && (
        <VoiceInlineNotice tone="warning" title={t('voice.plan.changePendingTitle')}>
          {t('voice.plan.changePending', {
            plan: t(`voice.plan.${pendingPlan.toLowerCase()}` as 'voice.plan.start'),
            date: new Date(pendingEffectiveAt).toLocaleDateString(moneyLocale),
          })}
        </VoiceInlineNotice>
      )}

      {error && (
        <VoiceInlineNotice tone="blocked">{error}</VoiceInlineNotice>
      )}

      {/* Mobile: stacked plan cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {plans.map(plan => (
          <PlanCard
            key={plan.code}
            plan={plan}
            selected={activePlan === plan.code}
            recommended={plan.code === RECOMMENDED_VOICE_PLAN}
            busy={selecting === plan.code}
            moneyLocale={moneyLocale}
            onSelect={() => handleSelectClick(plan.code)}
          />
        ))}
      </div>

      {/* Desktop: comparison + cards */}
      <div className="hidden md:block space-y-4">
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
            <caption className="sr-only">{t('voice.plan.compareCaption')}</caption>
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th scope="col" className="px-4 py-3 font-semibold text-muted-foreground">
                  {t('voice.plan.compareFeature')}
                </th>
                {plans.map(plan => (
                  <th key={plan.code} scope="col" className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-foreground">
                        {t(`voice.plan.${plan.code.toLowerCase()}` as 'voice.plan.start')}
                      </span>
                      {plan.code === RECOMMENDED_VOICE_PLAN && (
                        <StatusChip tone="info" className="w-fit text-[9px]">
                          {t('voice.plan.recommended')}
                        </StatusChip>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/30">
                <th scope="row" className="px-4 py-3 font-medium text-muted-foreground">
                  {t('voice.plan.monthlyFee')}
                </th>
                {plans.map(plan => (
                  <td key={plan.code} className="px-4 py-3 font-bold tabular-nums text-foreground">
                    {formatMoneyCents(plan.monthlyFeeCents, plan.currency, moneyLocale)}
                  </td>
                ))}
              </tr>
              {comparisonRows.map(row => (
                <tr key={row.key} className="border-b border-border/20">
                  <th scope="row" className="px-4 py-3 font-medium text-muted-foreground">
                    {row.labelKey}
                  </th>
                  {(['START', 'PRO', 'BUSINESS'] as const).map(code => (
                    <td key={code} className="px-4 py-3 tabular-nums text-foreground">
                      {row.values[code]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {plans.map(plan => (
            <PlanCard
              key={plan.code}
              plan={plan}
              selected={activePlan === plan.code}
              recommended={plan.code === RECOMMENDED_VOICE_PLAN}
              busy={selecting === plan.code}
              moneyLocale={moneyLocale}
              compact
              onSelect={() => handleSelectClick(plan.code)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {plans.map(plan => (
          <div
            key={`usage-${plan.code}`}
            className="rounded-xl border border-border/40 bg-muted/10 px-4 py-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('voice.plan.usageExampleTitle', {
                plan: t(`voice.plan.${plan.code.toLowerCase()}` as 'voice.plan.start'),
              })}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {t(`voice.plan.usageExample.${plan.code.toLowerCase()}` as 'voice.plan.usageExample.start')}
            </p>
          </div>
        ))}
      </div>

      <VoiceConfirmationDialog
        open={pendingSelection != null}
        onOpenChange={open => {
          if (!open) setPendingSelection(null);
        }}
        title={t('voice.plan.changeConfirmTitle')}
        description={t('voice.plan.changeConfirmDesc')}
        confirmLabel={t('voice.plan.changeConfirmAction')}
        cancelLabel={t('voice.common.cancel')}
        loading={Boolean(selecting)}
        onConfirm={() => {
          if (pendingSelection) void confirmPlanSelection(pendingSelection);
        }}
      />
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  recommended,
  busy,
  moneyLocale,
  compact,
  onSelect,
}: {
  plan: VoicePlanCatalogEntry;
  selected: boolean;
  recommended: boolean;
  busy: boolean;
  moneyLocale: string;
  compact?: boolean;
  onSelect: () => void;
}) {
  const { t } = useLanguage();
  const { entitlements } = plan;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'sq-press w-full rounded-2xl border p-4 text-left shadow-[var(--shadow-1)] transition-colors',
        selected
          ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]/20 ring-1 ring-[color:var(--brand)]/15'
          : 'border-border/40 surface-premium hover:border-[color:var(--brand)]/25',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-foreground">
            {t(`voice.plan.${plan.code.toLowerCase()}` as 'voice.plan.start')}
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {formatMoneyCents(plan.monthlyFeeCents, plan.currency, moneyLocale)}
            <span className="text-[10px] font-medium text-muted-foreground">
              {' '}
              / {t('voice.plan.month')}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {recommended && (
            <StatusChip tone="info" className="text-[9px]">
              <Sparkles className="mr-0.5 inline h-3 w-3" aria-hidden />
              {t('voice.plan.recommended')}
            </StatusChip>
          )}
          {selected && (
            <StatusChip tone="success" className="text-[9px]">
              <Check className="mr-0.5 inline h-3 w-3" aria-hidden />
              {t('voice.plan.selected')}
            </StatusChip>
          )}
        </div>
      </div>

      {!compact && (
        <dl className="mt-4 space-y-1.5 text-[10px] text-muted-foreground">
          <EntitlementRow label={t('voice.plan.includedMinutes')} value={String(entitlements.includedMinutesPerMonth)} />
          <EntitlementRow
            label={t('voice.plan.overage')}
            value={formatMoneyCents(entitlements.overageCentsPerMinute, plan.currency, moneyLocale)}
          />
          <EntitlementRow label={t('voice.plan.numbers')} value={String(entitlements.localPhoneNumbers)} />
          <EntitlementRow
            label={t('voice.plan.locations')}
            value={
              entitlements.maxBranches == null
                ? t('voice.plan.unlimited')
                : String(entitlements.maxBranches)
            }
          />
          <EntitlementRow label={t('voice.plan.parallel')} value={String(entitlements.maxConcurrentCalls)} />
          <EntitlementRow
            label={t('voice.plan.setupFee')}
            value={formatMoneyCents(plan.setupFeeCents, plan.currency, moneyLocale)}
            emphasize
          />
        </dl>
      )}

      {busy && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Icon name="loader-2" className="h-3 w-3 animate-spin" />
          {t('voice.common.saving')}
        </div>
      )}
    </button>
  );
}

function EntitlementRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-2',
        emphasize && 'border-t border-border/30 pt-2',
      )}
    >
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
