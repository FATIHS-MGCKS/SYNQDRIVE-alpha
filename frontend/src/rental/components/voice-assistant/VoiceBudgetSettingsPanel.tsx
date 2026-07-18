import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { VoiceInlineNotice, VoiceSectionHeader } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoiceBudgetPolicy, VoiceProtectionStatus } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';

interface VoiceBudgetSettingsPanelProps {
  orgId: string;
  isDarkMode?: boolean;
}

export function VoiceBudgetSettingsPanel({ orgId, isDarkMode = false }: VoiceBudgetSettingsPanelProps) {
  const { t } = useLanguage();
  const [protection, setProtection] = useState<VoiceProtectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monthlyBudgetEur, setMonthlyBudgetEur] = useState('');
  const [dailyLimitEur, setDailyLimitEur] = useState('');
  const [dailyOutboundMinutes, setDailyOutboundMinutes] = useState('');
  const [destinationPolicy, setDestinationPolicy] = useState<'DE_ONLY' | 'DE_EEA' | 'CUSTOM'>('DE_ONLY');
  const [overflowBehavior, setOverflowBehavior] = useState<'WARN' | 'HARD_STOP' | 'ALLOW_OVERAGE'>('WARN');

  const inputCls = cn(
    'w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors',
    isDarkMode
      ? 'surface-premium border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'border border-gray-200 bg-gray-50 text-gray-800 focus:border-purple-400',
  );
  const labelCls = cn('block text-[11px] font-semibold mb-1', isDarkMode ? 'text-muted-foreground' : 'text-gray-500');

  const applyPolicy = useCallback((policy: VoiceBudgetPolicy | null, snapshot?: VoiceProtectionStatus['snapshot']) => {
    if (!policy) return;
    setMonthlyBudgetEur(policy.monthlyBudgetCents != null ? String(policy.monthlyBudgetCents / 100) : '');
    setDailyLimitEur(policy.dailyLimitCents != null ? String(policy.dailyLimitCents / 100) : '');
    setDailyOutboundMinutes(
      policy.dailyOutboundMinutesLimit != null ? String(policy.dailyOutboundMinutesLimit) : '',
    );
    if (policy.destinationRegionPolicy === 'DE_EEA' || policy.destinationRegionPolicy === 'CUSTOM') {
      setDestinationPolicy(policy.destinationRegionPolicy);
    } else {
      setDestinationPolicy('DE_ONLY');
    }
    if (
      policy.overflowBehavior === 'HARD_STOP' ||
      policy.overflowBehavior === 'ALLOW_OVERAGE' ||
      policy.overflowBehavior === 'WARN'
    ) {
      setOverflowBehavior(policy.overflowBehavior);
    }
    void snapshot;
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const status = await api.voiceAssistant.protection.status(orgId);
      setProtection(status);
      applyPolicy(status.policy, status.snapshot);
    } catch (err) {
      toast.error(t('voice.budget.loadError'), { description: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [orgId, applyPolicy, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const monthlyBudgetCents = monthlyBudgetEur.trim()
        ? Math.round(Number.parseFloat(monthlyBudgetEur) * 100)
        : undefined;
      const dailyLimitCents = dailyLimitEur.trim()
        ? Math.round(Number.parseFloat(dailyLimitEur) * 100)
        : undefined;
      const dailyOutboundMinutesLimit = dailyOutboundMinutes.trim()
        ? Number.parseInt(dailyOutboundMinutes, 10)
        : undefined;

      await api.voiceAssistant.protection.updateBudgetPolicy(orgId, {
        ...(monthlyBudgetCents != null && Number.isFinite(monthlyBudgetCents) ? { monthlyBudgetCents } : {}),
        ...(dailyLimitCents != null && Number.isFinite(dailyLimitCents) ? { dailyLimitCents } : {}),
        ...(dailyOutboundMinutesLimit != null && Number.isFinite(dailyOutboundMinutesLimit)
          ? { dailyOutboundMinutesLimit }
          : {}),
        destinationRegionPolicy: destinationPolicy,
        overflowBehavior,
      });
      toast.success(t('voice.budget.saved'));
      await load();
    } catch (err) {
      toast.error(t('voice.budget.saveError'), { description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon name="loader-2" className="h-4 w-4 animate-spin" />
        {t('voice.common.loading')}
      </div>
    );
  }

  const snapshot = protection?.snapshot;

  return (
    <div className="space-y-4">
      <VoiceSectionHeader title={t('voice.budget.title')} description={t('voice.budget.description')} />
      <VoiceInlineNotice tone="info">{t('voice.budget.protectionNotice')}</VoiceInlineNotice>

      {snapshot && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.budget.usageMonthly')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">
              {(snapshot.consumedMonthlyCents / 100).toFixed(2)} €
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.budget.usageDailyMinutes')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">{snapshot.consumedDailyOutboundMinutes}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.budget.usagePct')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">
              {snapshot.usagePct != null ? `${snapshot.usagePct}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.budget.overrides')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">{snapshot.activeOverrides}</p>
          </div>
        </div>
      )}

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>{t('voice.budget.monthlyLimit')}</label>
            <input
              type="number"
              min={0}
              step={1}
              className={inputCls}
              value={monthlyBudgetEur}
              onChange={e => setMonthlyBudgetEur(e.target.value)}
              placeholder="500"
            />
          </div>
          <div>
            <label className={labelCls}>{t('voice.budget.dailyLimit')}</label>
            <input
              type="number"
              min={0}
              step={1}
              className={inputCls}
              value={dailyLimitEur}
              onChange={e => setDailyLimitEur(e.target.value)}
              placeholder="50"
            />
          </div>
          <div>
            <label className={labelCls}>{t('voice.budget.dailyOutboundMinutes')}</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={dailyOutboundMinutes}
              onChange={e => setDailyOutboundMinutes(e.target.value)}
              placeholder="120"
            />
          </div>
          <div>
            <label className={labelCls}>{t('voice.budget.destinations')}</label>
            <select
              className={inputCls}
              value={destinationPolicy}
              onChange={e => setDestinationPolicy(e.target.value as typeof destinationPolicy)}
            >
              <option value="DE_ONLY">{t('voice.budget.destinations.deOnly')}</option>
              <option value="DE_EEA">{t('voice.budget.destinations.deEea')}</option>
              <option value="CUSTOM">{t('voice.budget.destinations.custom')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('voice.budget.overflow')}</label>
            <select
              className={inputCls}
              value={overflowBehavior}
              onChange={e => setOverflowBehavior(e.target.value as typeof overflowBehavior)}
            >
              <option value="WARN">{t('voice.budget.overflow.warn')}</option>
              <option value="HARD_STOP">{t('voice.budget.overflow.hardStop')}</option>
              <option value="ALLOW_OVERAGE">{t('voice.budget.overflow.allowOverage')}</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="sq-press mt-4 rounded-xl bg-[color:var(--brand)] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? t('voice.common.saving') : t('voice.common.save')}
        </button>
      </div>
    </div>
  );
}
