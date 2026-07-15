import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import type {
  MasterContractHistoryDto,
  MasterContractPreviewDto,
  MasterContractStateDto,
} from '../../types/master-contract.types';
import {
  createMasterContractIdempotencyKey,
  mapMasterContractError,
  readLockVersion,
} from './master-contract.utils';

interface TenantOverviewShape {
  plan?: { kind: string; name: string } | null;
  contract?: {
    statusLabel?: string;
    trialEndsAt?: string | null;
    startedAt?: string | null;
    cancellationScheduledAt?: string | null;
    billingIntervalLabel?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  } | null;
  pricing?: {
    billableVehicleCount?: number;
    discounts?: Array<{ label: string; amount: { formatted: string } }>;
    grossAmount?: { formatted: string } | null;
  } | null;
  billing?: {
    nextExpectedInvoice?: { grossAmount?: { formatted: string } | null; dueAt?: string | null } | null;
    nextChargeAt?: string | null;
  } | null;
  paymentMethod?: { statusLabel?: string; defaultMethod?: { brand?: string | null; last4?: string | null } | null } | null;
}

export function useMasterOrgContract(
  row: AdminOrgBillingRowDto | null,
  open: boolean,
  onUpdated?: () => void,
) {
  const orgId = row?.organization.id ?? null;
  const [contractState, setContractState] = useState<MasterContractStateDto | null>(null);
  const [overview, setOverview] = useState<TenantOverviewShape | null>(null);
  const [history, setHistory] = useState<MasterContractHistoryDto | null>(null);
  const [preview, setPreview] = useState<MasterContractPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const lockVersion = useMemo(
    () =>
      readLockVersion(
        row?.subscription?.lockVersion,
        contractState?.contract?.lockVersion ?? contractState?.subscription?.lockVersion,
      ),
    [contractState, row?.subscription?.lockVersion],
  );

  const reload = useCallback(async () => {
    if (!orgId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const [contractRes, overviewRes, historyRes] = await Promise.all([
        api.billing.masterSubscriptionContract(orgId) as Promise<MasterContractStateDto>,
        api.billing.masterSubscriptionOverview(orgId) as Promise<TenantOverviewShape>,
        api.billing.masterSubscriptionHistory(orgId) as Promise<MasterContractHistoryDto>,
      ]);
      setContractState(contractRes);
      setOverview(overviewRes);
      setHistory(historyRes);
    } catch (err) {
      setError(mapMasterContractError(err));
    } finally {
      setLoading(false);
    }
  }, [open, orgId]);

  useEffect(() => {
    if (!open || !orgId) {
      setPreview(null);
      setActionMessage(null);
      return;
    }
    void reload();
  }, [open, orgId, reload]);

  const withLock = useCallback(
    (body: Record<string, unknown> = {}) =>
      lockVersion != null ? { ...body, lockVersion } : body,
    [lockVersion],
  );

  const runPreview = useCallback(
    async (body: Record<string, unknown>) => {
      if (!orgId) return null;
      setActionLoading(true);
      setError(null);
      try {
        const result = (await api.billing.masterSubscriptionPreview(orgId, body)) as MasterContractPreviewDto;
        setPreview(result);
        return result;
      } catch (err) {
        setError(mapMasterContractError(err));
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [orgId],
  );

  const runMutation = useCallback(
    async (
      action:
        | 'draft'
        | 'assign-rental'
        | 'assign-fleet'
        | 'select-price-version'
        | 'trial'
        | 'activate'
        | 'pause'
        | 'reactivate'
        | 'schedule-cancel'
        | 'revoke-cancel'
        | 'schedule-tariff-change'
        | 'schedule-price-version-change'
        | 'add-discount'
        | 'end-discount'
        | 'billing-anchor'
        | 'sync-stripe',
      body: Record<string, unknown> = {},
      options?: { discountId?: string },
    ) => {
      if (!orgId) return false;
      setActionLoading(true);
      setError(null);
      setActionMessage(null);
      const idempotencyKey = createMasterContractIdempotencyKey(action, orgId);
      const payload = withLock(body);

      try {
        switch (action) {
          case 'draft':
            await api.billing.masterSubscriptionCreateDraft(orgId, payload, idempotencyKey);
            break;
          case 'assign-rental':
            await api.billing.masterSubscriptionAssignRental(orgId, payload, idempotencyKey);
            break;
          case 'assign-fleet':
            await api.billing.masterSubscriptionAssignFleet(orgId, payload, idempotencyKey);
            break;
          case 'select-price-version':
            await api.billing.masterSubscriptionSelectPriceVersion(orgId, payload, idempotencyKey);
            break;
          case 'trial':
            await api.billing.masterSubscriptionConfigureTrial(orgId, payload, idempotencyKey);
            break;
          case 'activate':
            await api.billing.masterSubscriptionActivate(orgId, payload, idempotencyKey);
            break;
          case 'pause':
            await api.billing.masterSubscriptionPause(orgId, payload, idempotencyKey);
            break;
          case 'reactivate':
            await api.billing.masterSubscriptionReactivate(orgId, payload, idempotencyKey);
            break;
          case 'schedule-cancel':
            await api.billing.masterSubscriptionScheduleCancel(orgId, payload, idempotencyKey);
            break;
          case 'revoke-cancel':
            await api.billing.masterSubscriptionRevokeCancel(orgId, payload, idempotencyKey);
            break;
          case 'schedule-tariff-change':
            await api.billing.masterSubscriptionScheduleTariffChange(orgId, payload, idempotencyKey);
            break;
          case 'schedule-price-version-change':
            await api.billing.masterSubscriptionSchedulePriceVersionChange(orgId, payload, idempotencyKey);
            break;
          case 'add-discount':
            await api.billing.masterSubscriptionAddDiscount(orgId, payload, idempotencyKey);
            break;
          case 'end-discount':
            if (!options?.discountId) throw new Error('Rabatt-ID fehlt.');
            await api.billing.masterSubscriptionEndDiscount(
              orgId,
              options.discountId,
              payload,
              idempotencyKey,
            );
            break;
          case 'billing-anchor':
            await api.billing.masterSubscriptionConfigureBillingAnchor(orgId, payload, idempotencyKey);
            break;
          case 'sync-stripe': {
            const res = (await api.billing.adminSyncStripe(orgId)) as { message?: string };
            setActionMessage(res.message ?? 'Stripe-Synchronisation gestartet.');
            await reload();
            onUpdated?.();
            return true;
          }
          default:
            break;
        }

        setPreview(null);
        setActionMessage('Vertragsänderung wurde übernommen.');
        await reload();
        onUpdated?.();
        return true;
      } catch (err) {
        setError(mapMasterContractError(err));
        return false;
      } finally {
        setActionLoading(false);
      }
    },
    [onUpdated, orgId, reload, withLock],
  );

  return {
    contractState,
    overview,
    history,
    preview,
    loading,
    actionLoading,
    error,
    actionMessage,
    lockVersion,
    reload,
    runPreview,
    runMutation,
    clearPreview: () => setPreview(null),
    clearError: () => setError(null),
  };
}
