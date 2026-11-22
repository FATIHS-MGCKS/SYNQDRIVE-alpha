import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { ConfirmDialog, StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { MfaStepUpDialog } from '../../components/mfa/MfaStepUpDialog';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { formatDateTimeDe } from './cv.utils';
import {
  formatDimoTokenId,
  providerCheckStatusTone,
  recheckGateAppearsOff,
  shouldShowDimoPermissionsPanel,
  canOfferVehicleScopedMutations,
  resolveVehicleOwnerActionDisposition,
  stillPrivilegedTone,
  vehicleVerificationTone,
} from './dimo-privilege.presentation';
import { useConnectedVehicleDimoPrivilege } from './useConnectedVehicleDimoPrivilege';

type ConnectedVehicleDimoPermissionsSectionProps = {
  organizationId: string | null;
  vehicleId: string | null;
  enabled: boolean;
  tokenIdMasked: string | null | undefined;
  dimoConnectivityLabel: string;
};

function DimoPermissionsPanel({
  children,
  sectionId,
  ariaLabel,
  ariaBusy,
  className = '',
}: {
  children: ReactNode;
  sectionId?: string;
  ariaLabel: string;
  ariaBusy?: boolean;
  className?: string;
}) {
  return (
    <section
      id={sectionId}
      className={`mt-4 space-y-3 rounded-xl border border-border p-3 ${className}`.trim()}
      aria-label={ariaLabel}
      aria-busy={ariaBusy || undefined}
    >
      {children}
    </section>
  );
}

export function ConnectedVehicleDimoPermissionsSection({
  organizationId,
  vehicleId,
  enabled,
  tokenIdMasked,
  dimoConnectivityLabel,
}: ConnectedVehicleDimoPermissionsSectionProps) {
  const { t } = useLanguage();
  const sectionId = useId();
  const skipMfaCancelCleanupRef = useRef(false);
  const [handoffConfirmOpen, setHandoffConfirmOpen] = useState(false);
  const ariaSection = t('master.cv.dimoPrivilege.aria.section');

  const {
    status,
    vehicleRow,
    loading,
    loadError,
    refresh,
    recheckLoading,
    recheckError,
    recheckResult,
    runRecheck,
    handoffLoading,
    handoffError,
    handoffResult,
    runHandoff,
    prepareHandoffIdempotency,
    mfaRequired,
    retryAfterMfa,
    dismissMfa,
  } = useConnectedVehicleDimoPrivilege(organizationId, vehicleId, enabled);

  useEffect(() => {
    setHandoffConfirmOpen(false);
  }, [organizationId, vehicleId]);

  if (!enabled || !organizationId || !vehicleId) {
    return null;
  }

  if (loading) {
    return (
      <DimoPermissionsPanel ariaLabel={ariaSection} ariaBusy>
        <p className="text-sm text-muted-foreground flex items-center gap-2" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.cv.dimoPrivilege.loading')}
        </p>
      </DimoPermissionsPanel>
    );
  }

  if (loadError) {
    return (
      <DimoPermissionsPanel ariaLabel={ariaSection}>
        <p className="text-sm text-destructive" role="alert">
          {t('master.cv.dimoPrivilege.loadError')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
          {t('master.cv.dimoPrivilege.retry')}
        </Button>
      </DimoPermissionsPanel>
    );
  }

  if (!status || !shouldShowDimoPermissionsPanel(status)) {
    return null;
  }

  const providerLabel = t(
    `master.cv.dimoPrivilege.providerStatus.${status.providerCheckStatus}` as TranslationKey,
  );
  const vehicleVerificationKey = vehicleRow
    ? `master.cv.dimoPrivilege.vehicleVerification.${vehicleRow.verificationStatus}`
    : null;
  const stillPrivilegedKey =
    vehicleRow?.stillPrivileged === true
      ? 'master.cv.dimoPrivilege.stillPrivileged.true'
      : vehicleRow?.stillPrivileged === false
        ? 'master.cv.dimoPrivilege.stillPrivileged.false'
        : 'master.cv.dimoPrivilege.stillPrivileged.unknown';

  const ownerActionDisposition = resolveVehicleOwnerActionDisposition(vehicleRow);
  const vehicleMutationsAvailable = canOfferVehicleScopedMutations(vehicleRow);
  const gateOff = recheckGateAppearsOff(recheckResult?.detailCode ?? status.detailCode);

  const ownerActionMessageKey =
    ownerActionDisposition === 'required'
      ? 'master.cv.dimoPrivilege.ownerActionOutstanding'
      : ownerActionDisposition === 'cleared'
        ? 'master.cv.dimoPrivilege.ownerActionNone'
        : ownerActionDisposition === 'not_in_inventory'
          ? 'master.cv.dimoPrivilege.vehicleNotInDimoInventory'
          : 'master.cv.dimoPrivilege.ownerActionUnknown';

  return (
    <>
      <DimoPermissionsPanel sectionId={sectionId} ariaLabel={ariaSection} className="border-dashed bg-muted/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('master.cv.dimoPrivilege.sectionTitle')}
          </h4>
          <p className="text-[11px] text-muted-foreground max-w-xl">{t('master.cv.dimoPrivilege.connectivityNote')}</p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border p-3 space-y-2">
            <dt className="text-xs text-muted-foreground">{t('master.cv.dimoPrivilege.providerStatus.label')}</dt>
            <dd>
              <StatusChip tone={providerCheckStatusTone(status.providerCheckStatus)} dot>
                {providerLabel}
              </StatusChip>
            </dd>
            {status.providerCheckStatus === 'NOT_AVAILABLE' ? (
              <p className="text-[11px] text-muted-foreground">{t('master.cv.dimoPrivilege.notRevokedHint')}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t('master.cv.mapping.effectiveSynqDriveAccess')}</dt>
            <dd className="mt-1 text-sm font-medium">{dimoConnectivityLabel}</dd>
            <dd className="text-[11px] text-muted-foreground mt-1">
              {vehicleRow?.localConnectionStatus ?? '—'}
            </dd>
          </div>
          <div className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t('master.cv.dimoPrivilege.lastVerified')}</dt>
            <dd className="mt-1 font-medium">{formatDateTimeDe(status.lastVerifiedAt) ?? '—'}</dd>
          </div>
          <div className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t('master.cv.dimoPrivilege.tokenId')}</dt>
            <dd className="mt-1 font-mono text-xs">
              {formatDimoTokenId(vehicleRow?.tokenId ?? null, tokenIdMasked)}
            </dd>
          </div>
          <div className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t('master.cv.dimoPrivilege.offboardingJob')}</dt>
            <dd className="mt-1 font-medium">{status.jobStatus ?? '—'}</dd>
            {status.phase ? (
              <dd className="text-xs text-muted-foreground mt-1">
                {t('master.cv.dimoPrivilege.jobPhase')}: {status.phase}
              </dd>
            ) : null}
          </div>
          {vehicleRow ? (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <dt className="text-xs text-muted-foreground">{t('master.cv.dimoPrivilege.vehicleVerification.label')}</dt>
              <dd>
                {vehicleVerificationKey ? (
                  <StatusChip tone={vehicleVerificationTone(vehicleRow.verificationStatus)} dot>
                      {t(vehicleVerificationKey as TranslationKey)}
                  </StatusChip>
                ) : (
                  '—'
                )}
              </dd>
              <dd>
                <StatusChip tone={stillPrivilegedTone(vehicleRow.stillPrivileged)} dot>
                  {t(stillPrivilegedKey)}
                </StatusChip>
              </dd>
            </div>
          ) : null}
        </dl>

        <div
          className="rounded-lg border border-border/80 bg-background px-3 py-2 text-xs flex gap-2 items-start"
          role="status"
        >
          {ownerActionDisposition === 'required' ? (
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
          ) : ownerActionDisposition === 'cleared' ? (
            <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          )}
          <span>{t(ownerActionMessageKey as TranslationKey)}</span>
        </div>

        {status.detailCode ? (
          <p className="text-xs text-muted-foreground">
            {t('master.cv.dimoPrivilege.detailCode')}: <span className="font-mono">{status.detailCode}</span>
          </p>
        ) : null}

        {gateOff ? (
          <p className="text-xs text-amber-700 dark:text-amber-400" role="note">
            {t('master.cv.dimoPrivilege.recheck.gateOff')}
          </p>
        ) : null}

        {recheckResult ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
            {t('master.cv.dimoPrivilege.recheck.success')}
            {recheckResult.evidencePreserved ? ` ${t('master.cv.dimoPrivilege.recheck.evidencePreserved')}` : ''}
          </p>
        ) : null}
        {recheckError ? (
          <p className="text-xs text-destructive" role="alert">
            {t('master.cv.dimoPrivilege.recheck.error')} {recheckError}
          </p>
        ) : null}
        {handoffResult ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
            {handoffResult.idempotentReplay
              ? t('master.cv.dimoPrivilege.handoff.replay')
              : t('master.cv.dimoPrivilege.handoff.success')}
          </p>
        ) : null}
        {handoffError ? (
          <p className="text-xs text-destructive" role="alert">
            {t('master.cv.dimoPrivilege.handoff.error')} {handoffError}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">{t('master.cv.dimoPrivilege.handoff.internalOnlyDisclaimer')}</p>

        {!vehicleMutationsAvailable ? (
          <p className="text-xs text-muted-foreground" role="note">
            {t('master.cv.dimoPrivilege.vehicleMutationsUnavailable')}
          </p>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!vehicleMutationsAvailable || recheckLoading || handoffLoading}
            onClick={() => void runRecheck()}
          >
            {recheckLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                {t('master.cv.dimoPrivilege.recheck.loading')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                {t('master.cv.dimoPrivilege.recheck.action')}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!vehicleMutationsAvailable || recheckLoading || handoffLoading}
            onClick={() => {
              prepareHandoffIdempotency();
              setHandoffConfirmOpen(true);
            }}
          >
            {handoffLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                {t('master.cv.dimoPrivilege.handoff.loading')}
              </>
            ) : (
              t('master.cv.dimoPrivilege.handoff.action')
            )}
          </Button>
        </div>
      </DimoPermissionsPanel>

      <ConfirmDialog
        open={handoffConfirmOpen}
        onOpenChange={setHandoffConfirmOpen}
        title={t('master.cv.dimoPrivilege.handoff.confirmTitle')}
        description={t('master.cv.dimoPrivilege.handoff.confirmBody')}
        confirmLabel={t('master.cv.dimoPrivilege.handoff.confirmAction')}
        cancelLabel={t('master.cv.dimoPrivilege.handoff.cancel')}
        onConfirm={() => {
          setHandoffConfirmOpen(false);
          void runHandoff();
        }}
      />

      <MfaStepUpDialog
        open={mfaRequired}
        action="MASTER_ORGANIZATION"
        onSuccess={() => {
          skipMfaCancelCleanupRef.current = true;
          void retryAfterMfa();
        }}
        onClose={() => {
          if (skipMfaCancelCleanupRef.current) {
            skipMfaCancelCleanupRef.current = false;
            return;
          }
          dismissMfa();
        }}
      />
    </>
  );
}