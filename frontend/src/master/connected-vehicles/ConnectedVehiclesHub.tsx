import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MfaStepUpDialog } from '../../components/mfa/MfaStepUpDialog';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  isEnrollmentRequiredOffboardError,
  isStepUpRequiredOffboardError,
} from '../../lib/vehicle-offboard-api-error';
import type { Organization } from '../data/platform-data';
import { MasterPageHeader } from '../shell';
import { ConnectedVehiclesOverviewView } from './ConnectedVehiclesOverviewView';
import { ConnectedVehiclesListView } from './ConnectedVehiclesListView';
import { ConnectedVehicleDetailDrawer } from './ConnectedVehicleDetailDrawer';
import { ConnectedVehicleImportWizard } from './ConnectedVehicleImportWizard';
import {
  emitConnectedVehiclesRefresh,
  useConnectedVehiclesOverview,
} from './useConnectedVehiclesOperational';
import type { CvSection, VehicleOperationalRowDto } from './types';
import { readCvLocation, syncCvSectionUrl } from './cv.utils';
import { blockingReasonsFromError } from './vehicle-offboard.api-error';
import type { VehicleOffboardPreflightWarningCode, VehicleOffboardReasonCode } from './vehicle-offboard.types';
import { createOffboardIntentSession } from './offboard-intent-session';
import { OffboardPendingIntentConflictError } from './offboard-pending-intent';
import { useVehicleOffboard } from './useVehicleOffboard';
import { isMasterOffboardUiEnabled } from './vo5c-release-gates';
import { VehicleOffboardRequestError } from './vehicle-offboard.api-error';
import { ConnectedVehicleAddMenu } from './ConnectedVehicleAddMenu';
import { VehicleRegistrationModal } from '../components/VehicleRegistrationModal';
import { useAppTheme } from '../../context/AppThemeContext';
import type { DimoVehicle, RegisteredVehicle } from '../data/platform-data';
import {
  mapAdminVehicleDtoToRegisteredVehicle,
  mapApiDimoToDimoVehicle,
  persistMasterRegisteredVehicle,
  updateMasterRegisteredVehicle,
  type ManualBaselineArea,
} from './master-vehicle-registration';
import { api } from '../../lib/api';

interface ConnectedVehiclesHubProps {
  organizations: Organization[];
  onOpenOrganization?: (organizationId: string) => void;
  onOpenPlatformHealth?: () => void;
}

const WARNING_KEYS: Record<VehicleOffboardPreflightWarningCode, TranslationKey> = {
  OPEN_DAMAGE_WARNING: 'master.cv.offboard.warning.OPEN_DAMAGE_WARNING',
  OPEN_MAINTENANCE_WARNING: 'master.cv.offboard.warning.OPEN_MAINTENANCE_WARNING',
  UNPAID_BILLING_WARNING: 'master.cv.offboard.warning.UNPAID_BILLING_WARNING',
  FLEET_TASK_WARNING: 'master.cv.offboard.warning.FLEET_TASK_WARNING',
};

export function ConnectedVehiclesHub({
  organizations,
  onOpenOrganization,
  onOpenPlatformHealth,
}: ConnectedVehiclesHubProps) {
  const { t } = useLanguage();
  const { isDarkMode } = useAppTheme();
  const initial = useMemo(() => readCvLocation(window.location.search), []);
  const [section, setSection] = useState<CvSection>(initial.section);
  const [vehicleId, setVehicleId] = useState<string | null>(initial.vehicleId);
  const [dimoVehicleId, setDimoVehicleId] = useState<string | null>(initial.dimoVehicleId);
  const [listFilters, setListFilters] = useState<Record<string, string>>({});
  const overviewState = useConnectedVehiclesOverview();
  const offboard = useVehicleOffboard();
  const intentSession = useRef(createOffboardIntentSession()).current;
  const [mfaOpen, setMfaOpen] = useState(false);
  const skipMfaCancelCleanupRef = useRef(false);
  const detailRefreshRef = useRef<(() => void) | null>(null);
  const specsRefreshRef = useRef<(() => void) | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDimo, setRegistrationDimo] = useState<DimoVehicle | null>(null);
  const [registrationPrefillOrgId, setRegistrationPrefillOrgId] = useState<string | null>(null);
  const [editExistingVehicle, setEditExistingVehicle] = useState<RegisteredVehicle | null>(null);
  const [editSpecsLoading, setEditSpecsLoading] = useState(false);

  const navigateSection = useCallback((next: CvSection, replace = false) => {
    setSection(next);
    syncCvSectionUrl(next, { vehicleId: null, dimoVehicleId: null, replace });
    setVehicleId(null);
    setDimoVehicleId(null);
  }, []);

  const openVehicle = useCallback((rowOrId: VehicleOperationalRowDto | string | null, dimoId?: string | null) => {
    if (typeof rowOrId === 'string') {
      setVehicleId(rowOrId);
      setDimoVehicleId(null);
      syncCvSectionUrl('vehicles', { vehicleId: rowOrId });
      return;
    }
    if (rowOrId) {
      setVehicleId(rowOrId.vehicleId);
      setDimoVehicleId(rowOrId.vehicleId ? null : rowOrId.dimoVehicleId);
      syncCvSectionUrl('vehicles', {
        vehicleId: rowOrId.vehicleId,
        dimoVehicleId: rowOrId.vehicleId ? null : rowOrId.dimoVehicleId,
      });
      return;
    }
    setVehicleId(null);
    setDimoVehicleId(dimoId ?? null);
    syncCvSectionUrl('vehicles', { vehicleId: null, dimoVehicleId: dimoId ?? null });
  }, []);

  const closeDetail = useCallback(() => {
    setVehicleId(null);
    setDimoVehicleId(null);
    syncCvSectionUrl(section, { vehicleId: null, dimoVehicleId: null, replace: true });
  }, [section]);

  useEffect(() => {
    const onPop = () => {
      const loc = readCvLocation(window.location.search);
      setSection(loc.section);
      setVehicleId(loc.vehicleId);
      setDimoVehicleId(loc.dimoVehicleId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (initial.vehicleId || initial.dimoVehicleId) {
      setSection('vehicles');
    }
  }, [initial.vehicleId, initial.dimoVehicleId]);

  useEffect(() => {
    const fp = intentSession.peekFingerprint();
    if (!fp || !vehicleId) return;
    const [orgId, vid] = fp.split('|');
    if (vid !== vehicleId) {
      offboard.abandonPending();
      intentSession.abandon();
    }
  }, [vehicleId, offboard, intentSession]);

  const finishOffboardSuccess = useCallback(
    (result: { idempotentReplay: boolean; warnings: VehicleOffboardPreflightWarningCode[] }) => {
      toast.success(
        result.idempotentReplay ? t('master.cv.offboard.success.replay') : t('master.cv.offboard.success.title'),
      );
      if (result.warnings.length > 0) {
        const lines = result.warnings.map((w) => t(WARNING_KEYS[w]));
        toast.message(t('master.cv.offboard.explainer.title'), { description: lines.join(' · ') });
      }
      intentSession.settle();
      offboard.clear();
      overviewState.refresh();
      emitConnectedVehiclesRefresh();
      detailRefreshRef.current?.();
    },
    [intentSession, offboard, overviewState, t],
  );

  const handleOffboard = useCallback(
    async (input: {
      organizationId: string;
      vehicleId: string;
      reason: VehicleOffboardReasonCode;
      note?: string;
    }) => {
      if (!isMasterOffboardUiEnabled()) {
        toast.error(t('master.cv.release.blockedBackend'));
        throw new Error('OFFBOARD_UI_DISABLED');
      }
      let idempotencyKey: string;
      try {
        idempotencyKey = intentSession.resolveIdempotencyKey(input);
      } catch (e) {
        if (e instanceof OffboardPendingIntentConflictError) {
          toast.error(t('master.cv.offboard.error.pendingIntentConflict'));
          throw e;
        }
        throw e;
      }
      try {
        const result = await offboard.execute({
          ...input,
          idempotencyKey,
        });
        finishOffboardSuccess(result);
      } catch (err) {
        if (isStepUpRequiredOffboardError(err)) {
          setMfaOpen(true);
          throw err;
        }
        if (isEnrollmentRequiredOffboardError(err)) {
          intentSession.abandon();
          toast.error(t('master.cv.offboard.error.enrollment'));
          throw err;
        }
        if (err instanceof VehicleOffboardRequestError && err.code === 'OFFBOARD_STALE_RESPONSE') {
          throw err;
        }
        if (err instanceof VehicleOffboardRequestError && err.kind === 'TRANSPORT_UNCERTAIN') {
          toast.warning(t('master.cv.offboard.uncertainRetry'));
          throw err;
        }
        if (err instanceof VehicleOffboardRequestError && err.kind === 'OPERATIONALLY_BLOCKED') {
          intentSession.abandon();
          const blockers = blockingReasonsFromError(err);
          const labels = blockers.map((b) =>
            t(`master.cv.offboard.block.${b}` as TranslationKey),
          );
          toast.error(t('master.cv.offboard.error.operationalBlocked'), {
            description: labels.length ? labels.join(' · ') : undefined,
          });
          throw err;
        }
        if (err instanceof VehicleOffboardRequestError && err.kind === 'SEMANTIC_CONFLICT') {
          intentSession.abandon();
          toast.error(t('master.cv.offboard.error.generic'));
          throw err;
        }
        if (
          err instanceof OffboardPendingIntentConflictError ||
          (err instanceof VehicleOffboardRequestError && err.code === 'OFFBOARD_PENDING_INTENT_CONFLICT')
        ) {
          toast.error(t('master.cv.offboard.error.pendingIntentConflict'));
          throw err;
        }
        toast.error(err instanceof Error ? err.message : t('master.cv.offboard.error.generic'));
        throw err;
      }
    },
    [finishOffboardSuccess, intentSession, offboard, t],
  );

  const handleRetryUncertain = useCallback(async () => {
    try {
      const result = await offboard.retryUncertain();
      if (result) finishOffboardSuccess(result);
    } catch (err) {
      if (isStepUpRequiredOffboardError(err)) {
        setMfaOpen(true);
        return;
      }
      if (err instanceof VehicleOffboardRequestError && err.code === 'OFFBOARD_STALE_RESPONSE') {
        return;
      }
      if (err instanceof VehicleOffboardRequestError && err.kind === 'TRANSPORT_UNCERTAIN') {
        toast.warning(t('master.cv.offboard.uncertainRetry'));
        return;
      }
      toast.error(err instanceof Error ? err.message : t('master.cv.offboard.error.generic'));
    }
  }, [finishOffboardSuccess, offboard, t]);

  const handleMfaSuccess = useCallback(async () => {
    try {
      const result = await offboard.retryAfterMfa();
      if (result) finishOffboardSuccess(result);
    } catch (err) {
      if (isStepUpRequiredOffboardError(err)) {
        setMfaOpen(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : t('master.cv.offboard.error.generic'));
    }
  }, [finishOffboardSuccess, offboard, t]);

  const tabs = [
    { id: 'overview', label: t('master.cv.hub.tab.overview') },
    { id: 'vehicles', label: t('master.cv.hub.tab.vehicles') },
    { id: 'import', label: t('master.cv.hub.tab.import') },
  ] as const;

  const openManualRegistration = useCallback(() => {
    setRegistrationDimo(null);
    setRegistrationPrefillOrgId(null);
    setEditExistingVehicle(null);
    setRegistrationOpen(true);
  }, []);

  const openEditSpecifications = useCallback(async () => {
    if (!vehicleId) return;
    setEditSpecsLoading(true);
    try {
      const dto = await api.vehicles.get(vehicleId);
      const orgId = dto?.organizationId != null ? String(dto.organizationId) : '';
      if (!orgId) {
        toast.error(t('master.cv.technicalSpecs.editLoadError'));
        return;
      }
      setRegistrationDimo(null);
      setRegistrationPrefillOrgId(orgId);
      setEditExistingVehicle(mapAdminVehicleDtoToRegisteredVehicle(dto as Record<string, unknown>));
      setRegistrationOpen(true);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('master.cv.technicalSpecs.editLoadError'),
      );
    } finally {
      setEditSpecsLoading(false);
    }
  }, [t, vehicleId]);

  const handleUpdateRegisteredVehicle = useCallback(
    async (rv: RegisteredVehicle) => {
      await updateMasterRegisteredVehicle(rv);
      toast.success(t('master.cv.technicalSpecs.updateSuccess'));
      overviewState.refresh();
      emitConnectedVehiclesRefresh();
      detailRefreshRef.current?.();
      specsRefreshRef.current?.();
    },
    [overviewState, t],
  );

  const openDimoRegistration = useCallback(
    async (dimoVehicleId: string, organizationId?: string | null) => {
      try {
        const list = await api.dimo.nonRegistered();
        const match = (list ?? []).find(
          (row: { id?: string }) => String(row.id) === dimoVehicleId,
        );
        if (!match) {
          toast.error(t('master.cv.addVehicle.dimoNotFound'));
          return;
        }
        setRegistrationDimo(mapApiDimoToDimoVehicle(match as Record<string, unknown>));
        setRegistrationPrefillOrgId(organizationId ?? null);
        setRegistrationOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('master.cv.addVehicle.dimoLoadFailed'));
      }
    },
    [t],
  );

  const handlePersistRegistration = useCallback(
    async (rv: RegisteredVehicle) => {
      try {
        const result = await persistMasterRegisteredVehicle(rv, {
          dimoVehicleId: registrationDimo?.id ?? null,
        });
        const baselineAreaLabel = (area: ManualBaselineArea) => {
          if (area === 'tires') return t('master.cv.addVehicle.partialBaselineAreaTires');
          if (area === 'battery') return t('master.cv.addVehicle.partialBaselineAreaBattery');
          return t('master.cv.addVehicle.partialBaselineAreaBrakes');
        };
        const tireEnrichmentFailed =
          result.postActivationEnrichment?.tireTread?.status === 'FAILED';
        if (tireEnrichmentFailed) {
          const detail = result.postActivationEnrichment?.tireTread?.message;
          toast.warning(t('master.cv.addVehicle.partialTireEnrichmentTitle'), {
            description: detail
              ? t('master.cv.addVehicle.partialTireEnrichmentBodyWithDetail', { detail })
              : t('master.cv.addVehicle.partialTireEnrichmentBody'),
          });
        } else if (result.baselineFailures?.length) {
          const failedAreas = result.baselineFailures.map((f) => baselineAreaLabel(f.area)).join(', ');
          toast.warning(t('master.cv.addVehicle.partialBaselineTitle'), {
            description: t('master.cv.addVehicle.partialBaselineBody', { areas: failedAreas }),
          });
        } else {
          toast.success(t('master.cv.addVehicle.success'));
        }
        setRegistrationOpen(false);
        setRegistrationDimo(null);
        setRegistrationPrefillOrgId(null);
        overviewState.refresh();
        emitConnectedVehiclesRefresh();
        navigateSection('vehicles');
        openVehicle(result.vehicleId);
      } catch (e) {
        const message =
          e instanceof Error && e.message === 'VEHICLE_VIN_ALREADY_EXISTS'
            ? t('master.cv.addVehicle.errorDuplicateVin')
            : e instanceof Error
              ? e.message
              : t('master.cv.addVehicle.errorGeneric');
        toast.error(message);
        throw e;
      }
    },
    [navigateSection, openVehicle, overviewState, registrationDimo?.id, t],
  );

  return (
    <div className="space-y-5" data-testid="connected-vehicles-hub">
      <MasterPageHeader
        title={t('master.cv.hub.title')}
        description={t('master.cv.hub.description')}
        actions={
          <ConnectedVehicleAddMenu
            onAction={(action) => {
              if (action === 'import_dimo') navigateSection('import');
              else openManualRegistration();
            }}
          />
        }
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeTabId={section}
        onTabChange={(id) => navigateSection(id as CvSection)}
      />

      {section === 'overview' ? (
        <ConnectedVehiclesOverviewView
          overview={overviewState.overview}
          loading={overviewState.loading}
          error={overviewState.error}
          onRetry={overviewState.refresh}
          onGoVehicles={(filters) => {
            setListFilters(filters ?? {});
            navigateSection('vehicles');
          }}
          onOpenVehicle={(vid, did) => {
            if (vid) openVehicle(vid);
            else if (did) openVehicle(null, did);
          }}
          onGoPlatformHealth={() => onOpenPlatformHealth?.()}
        />
      ) : null}

      {section === 'vehicles' ? (
        <ConnectedVehiclesListView
          initialFilters={listFilters}
          onOpenVehicle={(row) => openVehicle(row)}
        />
      ) : null}

      {section === 'import' ? (
        <ConnectedVehicleImportWizard
          organizations={organizations}
          onImported={() => {
            overviewState.refresh();
            navigateSection('vehicles');
          }}
          onOpenVehicle={(id) => openVehicle(id)}
          onAdvancedRegister={(dimoVehicleId, organizationId) => {
            void openDimoRegistration(dimoVehicleId, organizationId);
          }}
        />
      ) : null}

      <ConnectedVehicleDetailDrawer
        open={Boolean(vehicleId || dimoVehicleId)}
        vehicleId={vehicleId}
        dimoVehicleId={dimoVehicleId}
        onClose={closeDetail}
        offboardUiEnabled={isMasterOffboardUiEnabled()}
        onOffboard={handleOffboard}
        offboardSubmitting={offboard.isSubmitting}
        offboardPhase={offboard.state.phase}
        onRetryUncertainOffboard={() => void handleRetryUncertain()}
        onAbandonOffboardIntent={() => {
          offboard.abandonPending();
          intentSession.abandon();
        }}
        onRegisterDetailRefresh={(fn) => {
          detailRefreshRef.current = fn;
        }}
        onRegisterSpecsRefresh={(fn) => {
          specsRefreshRef.current = fn;
        }}
        onEditSpecifications={() => void openEditSpecifications()}
        editSpecificationsLoading={editSpecsLoading}
        onOpenOrganization={onOpenOrganization}
      />

      <VehicleRegistrationModal
        isDarkMode={isDarkMode}
        isOpen={registrationOpen}
        onClose={() => {
          setRegistrationOpen(false);
          setRegistrationDimo(null);
          setRegistrationPrefillOrgId(null);
          setEditExistingVehicle(null);
        }}
        dimoVehicle={registrationDimo ?? undefined}
        existingVehicle={editExistingVehicle ?? undefined}
        organizations={organizations}
        initialOrganizationId={registrationPrefillOrgId}
        manualCreateOnly={!registrationDimo && !editExistingVehicle}
        onRegister={(rv) => handlePersistRegistration(rv)}
        onUpdate={editExistingVehicle ? (rv) => handleUpdateRegisteredVehicle(rv) : undefined}
      />

      <MfaStepUpDialog
        open={mfaOpen}
        action="MASTER_INTEGRATIONS"
        onClose={() => {
          setMfaOpen(false);
          if (skipMfaCancelCleanupRef.current) {
            skipMfaCancelCleanupRef.current = false;
            return;
          }
          offboard.abandonPending();
          intentSession.abandon();
        }}
        onSuccess={() => {
          skipMfaCancelCleanupRef.current = true;
          void handleMfaSuccess();
        }}
      />
    </div>
  );
}
