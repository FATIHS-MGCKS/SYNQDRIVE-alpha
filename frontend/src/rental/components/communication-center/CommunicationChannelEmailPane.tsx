import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Skeleton } from '../../../components/ui/skeleton';
import { ErrorState } from '../../../components/patterns/states';
import { api, getErrorMessage } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';
import { CommunicationChannelStatusChip } from './communication-channel-status';
import { canAccessEmailChannelSettings } from './communication-channels-permissions';
import { resolveEmailSettingsStatus } from './communication-email-settings-status';

interface CommunicationChannelEmailPaneProps {
  enabled?: boolean;
  onOpenEmailSettings: () => void;
}

export function CommunicationChannelEmailPane({
  enabled = true,
  onOpenEmailSettings,
}: CommunicationChannelEmailPaneProps) {
  const { t } = useLanguage();
  const { orgId, userRole } = useRentalOrg();
  const canAccess = canAccessEmailChannelSettings(userRole);
  const { isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !enabled || !canAccess) {
      setLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setLoading(true);
    setError(null);

    try {
      const settings = await api.orgEmail.getSettings(requestOrgId);
      if (!isCurrent(requestOrgId, generation)) return;
      setConfigured(resolveEmailSettingsStatus(settings) !== 'NOT_CONFIGURED');
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setError(getErrorMessage(err));
    } finally {
      if (isCurrent(requestOrgId, generation)) {
        setLoading(false);
      }
    }
  }, [canAccess, enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canAccess) {
    return (
      <div className="space-y-3" data-testid="communication-channel-email-restricted">
        <h2 className="text-sm font-semibold text-foreground">
          {t('communication.channels.email')}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {t('communication.channels.email.restricted')}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div data-testid="communication-channel-email-loading">
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        compact
        title={t('communication.channels.email.loadError')}
        error={error}
        onRetry={() => void load()}
      />
    );
  }

  const status = configured ? 'CONFIGURED' : 'NOT_CONFIGURED';

  return (
    <div className="space-y-4" data-testid="communication-channel-email">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t('communication.channels.email')}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('communication.channels.providerLabel')}: Resend
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('communication.channels.email.transactionalHint')}
          </p>
        </div>
        <CommunicationChannelStatusChip
          status={status}
          label={t(`communication.settings.status.${status}` as const)}
        />
      </div>

      <Button
        type="button"
        data-testid="communication-email-open-settings"
        onClick={onOpenEmailSettings}
      >
        {t('communication.channels.email.openSettings')}
      </Button>
    </div>
  );
}
