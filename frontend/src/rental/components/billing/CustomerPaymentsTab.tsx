import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import type { ConnectStatusDto } from '../../types/payments-connect.types';
import { Icon } from '../ui/Icon';
import {
  formatRequirementLabel,
  mapConnectStatusToUiState,
} from './payments-connect.utils';
import { usePaymentsConnectActions } from './usePaymentsConnectActions';
import { usePaymentsConnectData } from './usePaymentsConnectData';

function CustomerPaymentsSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard className="h-32 rounded-2xl" />
      <SkeletonCard className="h-48 rounded-2xl" />
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function RequirementsList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-[12px] font-semibold text-foreground mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-[12px] text-muted-foreground flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
            <span>{formatRequirementLabel(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActiveDetails({ status }: { status: ConnectStatusDto }) {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[
        {
          label: t('billing.customerPayments.paymentsEnabled'),
          value: status.chargesEnabled ? t('common.yes') : t('common.no'),
        },
        {
          label: t('billing.customerPayments.payoutsEnabled'),
          value: status.payoutsEnabled ? t('common.yes') : t('common.no'),
        },
        { label: t('billing.customerPayments.country'), value: status.country ?? '—' },
        { label: t('billing.customerPayments.currency'), value: status.defaultCurrency },
        {
          label: t('billing.customerPayments.bankAccount'),
          value: status.bankAccountLast4 ? `•••• ${status.bankAccountLast4}` : '—',
        },
        {
          label: t('billing.customerPayments.lastSynced'),
          value: status.lastSyncedAt
            ? new Date(status.lastSyncedAt).toLocaleString()
            : '—',
        },
      ].map((row) => (
        <div key={row.label} className="rounded-xl border border-border/60 px-3.5 py-3">
          <p className="text-[11px] text-muted-foreground">{row.label}</p>
          <p className="text-[14px] font-semibold text-foreground mt-0.5 tabular-nums">{row.value}</p>
        </div>
      ))}
    </div>
  );
}

export function CustomerPaymentsTab() {
  const { t } = useLanguage();
  const { orgId, hasPermission, loading: orgLoading } = useRentalOrg();
  const canRead = hasPermission('payments-connect', 'read');
  const canManage = hasPermission('payments-connect', 'manage');

  const { status, loading, error, errorCode, reload, setStatus } = usePaymentsConnectData(
    orgId,
    canRead,
  );
  const actions = usePaymentsConnectActions(orgId, canManage, setStatus);

  const uiState = mapConnectStatusToUiState(status, errorCode);

  if (orgLoading) {
    return <CustomerPaymentsSkeleton />;
  }

  if (!canRead) {
    return (
      <EmptyState
        icon={<Icon name="lock" className="w-5 h-5" />}
        title={t('billing.customerPayments.noAccessTitle')}
        description={t('billing.customerPayments.noAccessDescription')}
      />
    );
  }

  if (!orgId) {
    return (
      <ErrorState
        title={t('billing.customerPayments.orgMissingTitle')}
        description={t('billing.customerPayments.orgMissingDescription')}
        onRetry={() => void reload()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const statusTone = (() => {
    switch (uiState) {
      case 'ACTIVE':
        return 'sq-tone-success';
      case 'RESTRICTED':
      case 'DISABLED':
        return 'sq-tone-critical';
      case 'ONBOARDING':
        return 'sq-tone-brand';
      case 'FEATURE_DISABLED':
        return 'sq-tone-neutral';
      default:
        return 'sq-tone-neutral';
    }
  })();

  const statusLabel = (() => {
    switch (uiState) {
      case 'NOT_STARTED':
        return t('billing.customerPayments.state.notStarted');
      case 'ONBOARDING':
        return t('billing.customerPayments.state.onboarding');
      case 'RESTRICTED':
        return t('billing.customerPayments.state.restricted');
      case 'ACTIVE':
        return t('billing.customerPayments.state.active');
      case 'DISABLED':
        return t('billing.customerPayments.state.disabled');
      case 'FEATURE_DISABLED':
        return t('billing.customerPayments.state.featureDisabled');
      default:
        return t('billing.customerPayments.state.notStarted');
    }
  })();

  return (
    <div className="space-y-4" data-testid="customer-payments-tab">
      <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {t('billing.customerPayments.title')}
            </h3>
            <p className="text-[12px] mt-0.5 text-muted-foreground max-w-2xl">
              {t('billing.customerPayments.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge tone={statusTone} label={statusLabel} />
            {canManage && uiState !== 'FEATURE_DISABLED' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || actions.actionLoading === 'refresh'}
                onClick={() => void actions.refreshStatus().then(() => reload())}
              >
                {actions.actionLoading === 'refresh'
                  ? t('billing.customerPayments.syncing')
                  : t('billing.customerPayments.sync')}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <CustomerPaymentsSkeleton />
        ) : error ? (
          <ErrorState
            title={t('billing.customerPayments.loadErrorTitle')}
            description={error}
            onRetry={() => void reload()}
            retryLabel={t('common.retry')}
          />
        ) : uiState === 'FEATURE_DISABLED' ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-5">
            <p className="text-[13px] font-semibold text-foreground">
              {t('billing.customerPayments.featureDisabledTitle')}
            </p>
            <p className="text-[12px] mt-1 text-muted-foreground">
              {t('billing.customerPayments.featureDisabledDescription')}
            </p>
          </div>
        ) : uiState === 'NOT_STARTED' ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-5 text-center sm:text-left">
            <div className="sq-tone-brand w-10 h-10 rounded-xl mb-3 mx-auto sm:mx-0 flex items-center justify-center">
              <Icon name="wallet" className="w-5 h-5" />
            </div>
            <p className="text-[13px] font-semibold text-foreground">
              {t('billing.customerPayments.notStartedTitle')}
            </p>
            <p className="text-[12px] mt-1 text-muted-foreground max-w-xl">
              {t('billing.customerPayments.notStartedDescription')}
            </p>
            {canManage ? (
              <Button
                type="button"
                className="mt-4"
                size="sm"
                disabled={actions.actionLoading !== null}
                onClick={() => void actions.setupAndOnboard()}
              >
                {actions.actionLoading
                  ? t('billing.customerPayments.settingUp')
                  : t('billing.customerPayments.setupCta')}
              </Button>
            ) : (
              <p className="text-[12px] mt-3 text-muted-foreground">
                {t('billing.customerPayments.manageOnlyHint')}
              </p>
            )}
          </div>
        ) : uiState === 'ONBOARDING' || uiState === 'RESTRICTED' ? (
          <div className="space-y-4">
            <p className="text-[12px] text-muted-foreground">
              {uiState === 'RESTRICTED'
                ? t('billing.customerPayments.restrictedDescription')
                : t('billing.customerPayments.onboardingDescription')}
            </p>
            <RequirementsList
              title={t('billing.customerPayments.requirementsOpen')}
              items={[
                ...(status?.requirementsCurrentlyDue ?? []),
                ...(status?.requirementsPastDue ?? []),
              ]}
            />
            {canManage && (
              <Button
                type="button"
                size="sm"
                disabled={actions.actionLoading !== null}
                onClick={() => void actions.startOnboarding()}
              >
                {actions.actionLoading === 'onboarding'
                  ? t('billing.customerPayments.openingOnboarding')
                  : t('billing.customerPayments.continueCta')}
              </Button>
            )}
          </div>
        ) : uiState === 'ACTIVE' ? (
          <div className="space-y-4">
            <p className="text-[12px] sq-tone-success rounded-lg px-3 py-2">
              {t('billing.customerPayments.activeDescription')}
            </p>
            {status && !status.chargesEnabled && (
              <p className="text-[12px] sq-tone-critical rounded-lg px-3 py-2" role="status">
                {t('billing.customerPayments.chargesDisabledHint')}
              </p>
            )}
            {status && status.chargesEnabled && !status.payoutsEnabled && (
              <p className="text-[12px] sq-tone-watch rounded-lg px-3 py-2" role="status">
                {t('billing.customerPayments.payoutsDisabledHint')}
              </p>
            )}
            {status && <ActiveDetails status={status} />}
          </div>
        ) : (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-[13px] font-semibold text-foreground">
              {t('billing.customerPayments.disabledTitle')}
            </p>
            <p className="text-[12px] mt-1 text-muted-foreground">
              {status?.disabledReason
                ? formatRequirementLabel(status.disabledReason)
                : t('billing.customerPayments.disabledDescription')}
            </p>
            <p className="text-[12px] mt-3 text-muted-foreground">
              {t('billing.customerPayments.noPaymentLinksHint')}
            </p>
          </div>
        )}

        {actions.actionError && (
          <p className="mt-3 text-[12px] text-destructive" role="alert">
            {actions.actionError}
          </p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground px-1">
        {t('billing.customerPayments.safeDataHint')}
      </p>
    </div>
  );
}
