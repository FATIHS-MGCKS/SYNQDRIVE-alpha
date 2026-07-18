import { StatusChip } from '../../../../components/patterns';
import { EmptyState } from '../../../../components/patterns/states';
import { VoiceMetricCard, VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';
import { billingForecastHint, budgetWarningLevel, centsToEuros } from './voice-org-workspace.ops';

interface VoiceOrgBillingTabProps {
  workspace: VoiceControlPlaneOrgWorkspace;
}

export function VoiceOrgBillingTab({ workspace }: VoiceOrgBillingTabProps) {
  const billing = workspace.billing;
  const budgetCents =
    (workspace.detail.assistant as { monthlyBudgetCents?: number } | undefined)?.monthlyBudgetCents ??
    null;
  const budgetLevel = budgetWarningLevel(billing, budgetCents);
  const forecast = billingForecastHint(billing);

  if (!billing) {
    return (
      <EmptyState
        title="Keine Billing-Daten"
        description="Usage & Billing werden geladen sobald ein aktiver Voice-Tarif existiert."
      />
    );
  }

  const budgetTone =
    budgetLevel === 'over_limit' ? 'critical' : budgetLevel === 'near_limit' ? 'warning' : 'success';

  return (
    <div className="space-y-4" data-testid="voice-org-tab-billing">
      <VoiceSectionHeader
        title="Usage & Billing"
        description="Geschätzte vs. finale Kosten sind gekennzeichnet — keine Secrets."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VoiceMetricCard label="Tarif" value={billing.planCode ?? '—'} />
        <VoiceMetricCard
          label="Periode"
          value={new Date(billing.periodStart).toLocaleDateString('de-DE')}
          hint={`bis ${new Date(billing.periodEnd).toLocaleDateString('de-DE')}`}
        />
        <VoiceMetricCard
          label="Minuten"
          value={billing.consumedMinutes.toFixed(1)}
          hint={`${billing.remainingIncludedMinutes.toFixed(0)} inkl. übrig`}
        />
        <VoiceMetricCard label="Overage" value={billing.overageMinutes.toFixed(1)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VoiceMetricCard label="Providerkosten" value={centsToEuros(billing.providerCostCents)} />
        <VoiceMetricCard label="Umsatz" value={centsToEuros(billing.revenueCents)} />
        <VoiceMetricCard
          label="Deckungsbeitrag"
          value={centsToEuros(billing.marginCents)}
          hint={`Marge ${billing.marginPercent?.toFixed(1) ?? '—'} %`}
        />
        <VoiceMetricCard
          label="Budget"
          value={budgetCents != null ? centsToEuros(budgetCents) : 'Nicht gesetzt'}
          tone={budgetTone}
        />
      </div>

      <div className="rounded-xl border border-border p-4 grid gap-3 sm:grid-cols-2 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Geschätzte Kosten (nicht final)</p>
          <p className="font-semibold tabular-nums">{centsToEuros(billing.estimatedCostCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Finale Kosten</p>
          <p className="font-semibold tabular-nums">{centsToEuros(billing.finalCostCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Inbound / Outbound</p>
          <p className="tabular-nums">
            {billing.inboundMinutes.toFixed(1)} / {billing.outboundMinutes.toFixed(1)} min
          </p>
        </div>
        {forecast && (
          <div>
            <p className="text-muted-foreground mb-1">Forecast</p>
            <p>{forecast}</p>
          </div>
        )}
      </div>

      {budgetLevel !== 'ok' && budgetLevel !== 'not_set' && (
        <div className="flex items-center gap-2">
          <StatusChip tone={budgetLevel === 'over_limit' ? 'critical' : 'warning'}>
            {budgetLevel === 'over_limit' ? 'Budget überschritten' : 'Budget nahe Limit'}
          </StatusChip>
        </div>
      )}
    </div>
  );
}
