import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type DataProcessingAgreementListItem,
  type DataProcessingHubMetricsDto,
  type EnforcementCoverageSummaryDto,
} from '../../../../lib/api';
import type { DataProcessingPermissions } from '../../../lib/data-processing-permissions';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { DataProcessingSectionId } from './data-processing.constants';

export interface DataProcessingHubState {
  metrics: DataProcessingHubMetricsDto | null;
  coverage: EnforcementCoverageSummaryDto | null;
  partners: DataProcessingAgreementListItem[];
  loading: boolean;
  error: string | null;
  sectionErrors: Partial<Record<DataProcessingSectionId, string>>;
  reload: () => Promise<void>;
}

export function useDataProcessingHub(
  orgId: string | null,
  permissions: DataProcessingPermissions,
): DataProcessingHubState {
  const { t } = useLanguage();
  const [metrics, setMetrics] = useState<DataProcessingHubMetricsDto | null>(null);
  const [coverage, setCoverage] = useState<EnforcementCoverageSummaryDto | null>(null);
  const [partners, setPartners] = useState<DataProcessingAgreementListItem[]>([]);
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

      tasks.push(
        api.dataProcessing
          .hubMetrics(orgId)
          .then(setMetrics)
          .catch((e: Error) => {
            setMetrics(null);
            errors.activities = e.message;
          }),
      );

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

      await Promise.all(tasks);
      setSectionErrors(errors);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dataProcessing.error.unknown'));
    } finally {
      setLoading(false);
    }
  }, [orgId, permissions, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    metrics,
    coverage,
    partners,
    loading,
    error,
    sectionErrors,
    reload,
  };
}
