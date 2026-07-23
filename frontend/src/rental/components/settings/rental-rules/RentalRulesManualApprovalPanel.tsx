import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { useLanguage } from '../../../i18n/LanguageContext';

interface ApprovalRow {
  id: string;
  status: string;
  exceptionReason: string;
  decisionReason: string | null;
  bookingId: string;
}

interface RentalRulesManualApprovalPanelProps {
  orgId: string;
  bookingIds: string[];
  approvalIds: string[];
  pendingCount: number;
}

export function RentalRulesManualApprovalPanel({
  orgId,
  bookingIds,
  approvalIds,
  pendingCount,
}: RentalRulesManualApprovalPanelProps) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || bookingIds.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const uniqueBookingIds = [...new Set(bookingIds)].slice(0, 10);
      const nested = await Promise.all(
        uniqueBookingIds.map(async (bookingId) => {
          const approvals = await api.bookings.listEligibilityApprovals(orgId, bookingId);
          return approvals
            .filter((row) => approvalIds.length === 0 || approvalIds.includes(row.id))
            .map((row) => ({ ...row, bookingId }));
        }),
      );
      setRows(nested.flat());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [approvalIds, bookingIds, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: ApprovalRow, decision: 'APPROVE' | 'REJECT') => {
    const reason = decisionReason[row.id]?.trim();
    if (!reason) {
      toast.error(t('rentalRules.workflow.approval.reasonRequired'));
      return;
    }
    setActingId(row.id);
    try {
      await api.bookings.decideEligibilityApproval(orgId, row.bookingId, row.id, {
        decision,
        decisionReason: reason,
      });
      toast.success(t('rentalRules.workflow.approval.decided'));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rentalRules.workflow.approval.failed'));
    } finally {
      setActingId(null);
    }
  };

  if (pendingCount === 0 && rows.length === 0) return null;

  return (
    <section aria-labelledby="manual-approval-heading" className="rounded-lg border border-border/70 bg-muted/10 p-3">
      <h4 id="manual-approval-heading" className="text-[12px] font-medium text-foreground">
        {t('rentalRules.workflow.approval.title', { count: pendingCount || rows.length })}
      </h4>
      {loading ? <p className="mt-2 text-[12px] text-muted-foreground">{t('rentalRules.workflow.approval.loading')}</p> : null}
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-[12px]">
            <p className="font-medium text-foreground">{row.exceptionReason}</p>
            <p className="mt-0.5 text-muted-foreground">
              {t('rentalRules.workflow.approval.status', { status: row.status })}
            </p>
            {row.status === 'PENDING' ? (
              <div className="mt-2 space-y-2">
                <label className="block">
                  <span className="sr-only">{t('rentalRules.workflow.approval.decisionReason')}</span>
                  <textarea
                    value={decisionReason[row.id] ?? ''}
                    onChange={(e) =>
                      setDecisionReason((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                    rows={2}
                    className="sq-input w-full resize-y text-[12px]"
                    placeholder={t('rentalRules.workflow.approval.decisionReason')}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={actingId === row.id}
                    onClick={() => void decide(row, 'APPROVE')}
                  >
                    {t('rentalRules.workflow.approval.approve')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="neutral"
                    disabled={actingId === row.id}
                    onClick={() => void decide(row, 'REJECT')}
                  >
                    {t('rentalRules.workflow.approval.reject')}
                  </Button>
                </div>
              </div>
            ) : row.decisionReason ? (
              <p className="mt-1 text-muted-foreground">{row.decisionReason}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
