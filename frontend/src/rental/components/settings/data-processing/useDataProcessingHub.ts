import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type AuthorizationDecisionAuditItem,
  type DataAuthorizationDto,
  type DataProcessingAgreementListItem,
  type EnforcementCoverageSummaryDto,
  type ProcessingActivityRegisterListItem,
} from '../../../lib/api';
import { buildDataProcessingReadinessSummary } from '../../../lib/data-processing-readiness';
import type { DataProcessingPermissions } from '../../../lib/data-processing-permissions';
import type { DataProcessingSectionId } from './data-processing.constants';

export interface DataProcessingHubState {
  activities: ProcessingActivityRegisterListItem[];
  coverage: EnforcementCoverageSummaryDto | null;
  partners: DataProcessingAgreementListItem[];
  legacyAuthorizations: DataAuthorizationDto[];
  auditDecisions: AuthorizationDecisionAuditItem[];
  readiness: ReturnType<typeof buildDataProcessingReadinessSummary>;
  loading: boolean;
  error: string | null;
  sectionErrors: Partial<Record<DataProcessingSectionId, string>>;
  reload: () => Promise<void>;
}

export function useDataProcessingHub(
  orgId: string | null,
  permissions: DataProcessingPermissions,
): DataProcessingHubState {
  const [activities, setActivities] = useState<ProcessingActivityRegisterListItem[]>([]);
  const [coverage, setCoverage] = useState<EnforcementCoverageSummaryDto | null>(null);
  const [partners, setPartners] = useState<DataProcessingAgreementListItem[]>([]);
  const [legacyAuthorizations, setLegacyAuthorizations] = useState<DataAuthorizationDto[]>([]);
  const [auditDecisions, setAuditDecisions] = useState<AuthorizationDecisionAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<DataProcessingSectionId, string>>>({});

  const reload = useCallback(async () => {
    if (!orgId || !permissions.canViewHub) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const errors: Partial<Record<DataProcessingSectionId, string>> = {};

    try {
      const tasks: Array<Promise<void>> = [];

      if (permissions.canViewActivities) {
        tasks.push(
          api.dataProcessing.register
            .list(orgId, { limit: 50 })
            .then((res) => setActivities(res.data ?? []))
            .catch((e: Error) => {
              errors.activities = e.message;
              setActivities([]);
            }),
        );
      }

      if (permissions.canViewEnforcement) {
        tasks.push(
          api.dataProcessing.coverage
            .get(orgId)
            .then(setCoverage)
            .catch((e: Error) => {
              errors.enforcement = e.message;
              setCoverage(null);
            }),
        );
      }

      if (permissions.canViewPartners) {
        tasks.push(
          api.dataProcessing.dpa
            .list(orgId)
            .then(setPartners)
            .catch((e: Error) => {
              errors.partners = e.message;
              setPartners([]);
            }),
        );
      }

      if (permissions.canViewConsents || permissions.canViewProviders) {
        tasks.push(
          api.dataAuthorizations
            .list(orgId)
            .then(setLegacyAuthorizations)
            .catch((e: Error) => {
              errors.consents = e.message;
              errors.providers = e.message;
              setLegacyAuthorizations([]);
            }),
        );
      }

      if (permissions.canViewAudit) {
        tasks.push(
          api.dataProcessing.audit
            .authorizationDecisions(orgId, { limit: 50 })
            .then((res) => setAuditDecisions(res.items ?? []))
            .catch((e: Error) => {
              errors.audit = e.message;
              setAuditDecisions([]);
            }),
        );
      }

      await Promise.all(tasks);
      setSectionErrors(errors);

      const criticalCount = Object.keys(errors).length;
      if (criticalCount > 0 && tasks.length === criticalCount) {
        setError('Daten konnten nicht geladen werden. Bitte Berechtigungen und Verbindung prüfen.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [orgId, permissions]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const readiness = useMemo(
    () =>
      buildDataProcessingReadinessSummary({
        activities,
        coverage,
        partners,
        legacyAuthorizations,
      }),
    [activities, coverage, partners, legacyAuthorizations],
  );

  return {
    activities,
    coverage,
    partners,
    legacyAuthorizations,
    auditDecisions,
    readiness,
    loading,
    error,
    sectionErrors,
    reload,
  };
}
