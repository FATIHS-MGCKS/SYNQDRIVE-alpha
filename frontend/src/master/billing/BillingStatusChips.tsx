import { StatusChip } from '../../components/patterns';
import type { BillingAttentionSummary, BillingHealth, ReconciliationHealth } from './types';
import {
  attentionReasonLabel,
  attentionSeverityTone,
  billingHealthLabel,
  billingHealthTone,
  domainStatusLabel,
  domainStatusTone,
  reconciliationHealthLabel,
  reconciliationHealthTone,
} from './billing.utils';

export function BillingAttentionChip({
  attention,
  compact = false,
}: {
  attention: BillingAttentionSummary;
  compact?: boolean;
}) {
  if (attention.severity === 'none') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const label = attention.primaryReason
    ? attentionReasonLabel(attention.primaryReason)
    : 'Aufmerksamkeit';
  const suffix =
    attention.reasonCount > 1 && !compact ? ` (+${attention.reasonCount - 1})` : '';
  return (
    <StatusChip tone={attentionSeverityTone(attention.severity)} className="!text-xs">
      {label}
      {suffix}
    </StatusChip>
  );
}

export function BillingDomainStatusChip({ status }: { status: string }) {
  return (
    <StatusChip tone={domainStatusTone(status)} dot className="!text-xs">
      {domainStatusLabel(status)}
    </StatusChip>
  );
}

export function BillingHealthChip({ health }: { health: BillingHealth }) {
  return (
    <StatusChip tone={billingHealthTone(health)} className="!text-xs">
      {billingHealthLabel(health)}
    </StatusChip>
  );
}

export function BillingReconciliationChip({ health }: { health: ReconciliationHealth }) {
  return (
    <StatusChip tone={reconciliationHealthTone(health)} className="!text-xs">
      {reconciliationHealthLabel(health)}
    </StatusChip>
  );
}
