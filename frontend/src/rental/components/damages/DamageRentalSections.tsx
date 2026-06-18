import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { PickupContextResult } from '../../lib/damage-pickup-context';
import type { DamageLiabilityStatus, DamageResponse } from '../../lib/damage.types';
import {
  DAMAGE_LIABILITY_OPTIONS,
  formatDamageDate,
  formatDamageSource,
  formatEuroCents,
  formatLiabilityStatus,
} from '../../lib/damage.types';

interface DamageRentalSectionsProps {
  damage: DamageResponse;
  pickupContext: PickupContextResult;
  busy?: boolean;
  onUpdateLiability: (
    damage: DamageResponse,
    input: { liabilityStatus: DamageLiabilityStatus; liabilityNote?: string },
  ) => Promise<void>;
  onPrepareDepositHold: (damage: DamageResponse, cents: number) => Promise<void>;
  onPrepareCustomerCharge: (damage: DamageResponse, cents: number) => Promise<void>;
}

export function DamageRentalSections({
  damage,
  pickupContext,
  busy,
  onUpdateLiability,
  onPrepareDepositHold,
  onPrepareCustomerCharge,
}: DamageRentalSectionsProps) {
  const [liabilityStatus, setLiabilityStatus] = useState<DamageLiabilityStatus>(
    damage.liabilityStatus ?? 'NOT_APPLICABLE',
  );
  const [liabilityNote, setLiabilityNote] = useState(damage.liabilityNote ?? '');
  const [depositEuro, setDepositEuro] = useState(
    damage.depositHoldCents != null ? String(damage.depositHoldCents / 100) : '',
  );
  const [chargeEuro, setChargeEuro] = useState(
    damage.chargedToCustomerCents != null ? String(damage.chargedToCustomerCents / 100) : '',
  );
  const [sectionError, setSectionError] = useState<string | null>(null);

  useEffect(() => {
    setLiabilityStatus(damage.liabilityStatus ?? 'NOT_APPLICABLE');
    setLiabilityNote(damage.liabilityNote ?? '');
    setDepositEuro(damage.depositHoldCents != null ? String(damage.depositHoldCents / 100) : '');
    setChargeEuro(
      damage.chargedToCustomerCents != null ? String(damage.chargedToCustomerCents / 100) : '',
    );
    setSectionError(null);
  }, [
    damage.id,
    damage.liabilityStatus,
    damage.liabilityNote,
    damage.depositHoldCents,
    damage.chargedToCustomerCents,
  ]);

  const hasRentalContext = useMemo(
    () =>
      Boolean(
        damage.bookingId ||
          damage.customerId ||
          damage.handoverProtocolId ||
          damage.source !== 'MANUAL',
      ),
    [damage.bookingId, damage.customerId, damage.handoverProtocolId, damage.source],
  );

  return (
    <div className="space-y-5">
      {hasRentalContext && (
        <section>
          <h4 className="sq-section-label mb-2">Rental context</h4>
          <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 space-y-2 text-[12px]">
            <ContextRow label="Source" value={formatDamageSource(damage.source)} />
            {damage.bookingId && <ContextRow label="Booking" value={damage.bookingId} mono />}
            {damage.customerId && <ContextRow label="Customer" value={damage.customerId} mono />}
            {pickupContext.label && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-muted-foreground">Pickup context</span>
                <StatusChip
                  tone={
                    pickupContext.context === 'NEW_SINCE_PICKUP'
                      ? 'warning'
                      : pickupContext.context === 'NEEDS_REVIEW'
                        ? 'critical'
                        : 'neutral'
                  }
                >
                  {pickupContext.label}
                </StatusChip>
              </div>
            )}
            {pickupContext.suggestedPickupDamageId && (
              <p className="text-[11px] text-muted-foreground">
                Suggested pickup match: {pickupContext.suggestedPickupDamageId.slice(0, 8)}… (
                {pickupContext.matchConfidence} confidence) — operator must confirm.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">{pickupContext.reason}</p>
          </div>
        </section>
      )}

      {damage.handoverProtocolId && (
        <section>
          <h4 className="sq-section-label mb-2">Handover context</h4>
          <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 text-[12px] space-y-1">
            <ContextRow label="Protocol" value={damage.handoverProtocolId} mono />
            <ContextRow label="Recorded via" value={formatDamageSource(damage.source)} />
            {damage.reportedBy && <ContextRow label="Reported by" value={damage.reportedBy} />}
          </div>
        </section>
      )}

      <section>
        <h4 className="sq-section-label mb-2">Liability</h4>
        <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted-foreground">Status</span>
            <StatusChip
              tone={
                damage.liabilityStatus === 'DISPUTED' || damage.liabilityStatus === 'NEEDS_REVIEW'
                  ? 'warning'
                  : damage.liabilityStatus === 'CUSTOMER_RESPONSIBLE'
                    ? 'critical'
                    : 'neutral'
              }
            >
              {formatLiabilityStatus(damage.liabilityStatus)}
            </StatusChip>
          </div>
          <label className="block">
            <span className="text-[11px] text-muted-foreground">Operator decision</span>
            <select
              value={liabilityStatus}
              disabled={busy}
              onChange={(e) => setLiabilityStatus(e.target.value as DamageLiabilityStatus)}
              className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            >
              {DAMAGE_LIABILITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {formatLiabilityStatus(opt)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-muted-foreground">Reason / note</span>
            <textarea
              value={liabilityNote}
              disabled={busy}
              onChange={(e) => setLiabilityNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm resize-none"
              placeholder="Document operator reasoning — never auto-assigned"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSectionError(null);
              void onUpdateLiability(damage, {
                liabilityStatus,
                liabilityNote: liabilityNote.trim() || undefined,
              }).catch(() => setSectionError('Could not save liability decision.'));
            }}
            className="sq-press px-3 py-2 rounded-lg text-[11px] font-semibold border border-border/70 disabled:opacity-50"
          >
            Save liability decision
          </button>
          {sectionError && <p className="text-[11px] text-red-600 dark:text-red-400">{sectionError}</p>}
        </div>
      </section>

      <section>
        <h4 className="sq-section-label mb-2">Cost & deposit</h4>
        <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 space-y-3 text-[12px]">
          <ContextRow label="Estimated repair" value={formatEuroCents(damage.estimatedCostCents) ?? '—'} />
          <ContextRow
            label="Actual repair cost"
            value={
              damage.repairCostCents != null
                ? `${formatEuroCents(damage.repairCostCents)} · recorded on repair`
                : '—'
            }
          />
          <ContextRow
            label="Deposit hold (recorded)"
            value={formatEuroCents(damage.depositHoldCents) ?? 'Not set'}
          />
          <ContextRow
            label="Customer charge (prepared)"
            value={
              damage.chargedToCustomerCents != null
                ? `${formatEuroCents(damage.chargedToCustomerCents)} · not invoiced automatically`
                : 'Not charged'
            }
          />
          <p className="text-[11px] text-muted-foreground">
            Prepare amounts on the damage record only. Deposit retention and final invoice line items
            require the booking billing workflow (not triggered here).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-muted-foreground">Prepare deposit hold (€)</span>
              <input
                type="text"
                inputMode="decimal"
                value={depositEuro}
                disabled={busy || !damage.bookingId}
                onChange={(e) => setDepositEuro(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
                placeholder={damage.bookingId ? '0.00' : 'Requires booking link'}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground">Prepare customer charge (€)</span>
              <input
                type="text"
                inputMode="decimal"
                value={chargeEuro}
                disabled={busy}
                onChange={(e) => setChargeEuro(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {damage.bookingId && (
              <button
                type="button"
                disabled={busy || !depositEuro.trim()}
                onClick={() => {
                  const num = Number(depositEuro.replace(',', '.'));
                  if (!Number.isFinite(num) || num < 0) {
                    setSectionError('Deposit amount must be zero or greater.');
                    return;
                  }
                  setSectionError(null);
                  void onPrepareDepositHold(damage, Math.round(num * 100)).catch(() =>
                    setSectionError('Could not prepare deposit hold.'),
                  );
                }}
                className="sq-press px-3 py-2 rounded-lg text-[11px] font-semibold border border-border/70 disabled:opacity-50"
              >
                Prepare deposit hold
              </button>
            )}
            <button
              type="button"
              disabled={busy || !chargeEuro.trim()}
              onClick={() => {
                const num = Number(chargeEuro.replace(',', '.'));
                if (!Number.isFinite(num) || num < 0) {
                  setSectionError('Charge amount must be zero or greater.');
                  return;
                }
                setSectionError(null);
                void onPrepareCustomerCharge(damage, Math.round(num * 100)).catch(() =>
                  setSectionError('Could not prepare customer charge.'),
                );
              }}
              className="sq-press px-3 py-2 rounded-lg text-[11px] font-semibold border border-border/70 disabled:opacity-50"
            >
              Prepare customer charge
            </button>
          </div>
        </div>
      </section>

      <section>
        <h4 className="sq-section-label mb-2">Evidence package</h4>
        <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-[12px] text-muted-foreground space-y-1">
          <p className="flex items-center gap-1.5">
            <Icon name="camera" className="w-3.5 h-3.5" />
            {damage.images.length} photo{damage.images.length === 1 ? '' : 's'}
          </p>
          {formatDamageDate(damage.reportedAt) && (
            <p>Reported {formatDamageDate(damage.reportedAt)}</p>
          )}
          {damage.reportedBy && <p>By {damage.reportedBy}</p>}
          <p>Source: {formatDamageSource(damage.source)}</p>
          {damage.bookingId && <p>Booking: {damage.bookingId.slice(0, 8)}…</p>}
          <p className="text-[11px] pt-1">PDF export not connected — evidence is shown inline below.</p>
        </div>
      </section>
    </div>
  );
}

function ContextRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground text-right ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}
