import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';
import {
  resolveSmsSettingsStatus,
  resolveVoiceSettingsStatus,
  resolveWhatsAppSettingsStatus,
  type CommunicationSettingsStatusKind,
} from './communication-settings-status';
import {
  canManageVoiceSettings,
  canManageWhatsAppSettings,
  canViewSmsSettingsInSettings,
  type HasPermissionFn,
} from './communication-settings-permissions';

interface UseCommunicationSettingsOverviewOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
  hasPermission: HasPermissionFn;
  membershipRole?: string | null;
}

export type CommunicationSettingsOverviewChannel = {
  key: 'whatsapp' | 'voice' | 'sms';
  status: CommunicationSettingsStatusKind;
  loading: boolean;
  error: string | null;
};

export function useCommunicationSettingsOverview({
  orgId,
  enabled = true,
  hasPermission,
  membershipRole,
}: UseCommunicationSettingsOverviewOptions) {
  const { isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [whatsappStatus, setWhatsappStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [voiceStatus, setVoiceStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [smsStatus, setSmsStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({
    whatsapp: null,
    voice: null,
    sms: null,
  });

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setLoading(true);
    setErrors({ whatsapp: null, voice: null, sms: null });

    const tasks: Promise<void>[] = [];

    if (canManageWhatsAppSettings(hasPermission, membershipRole)) {
      tasks.push(
        api.whatsapp
          .getConfig(requestOrgId)
          .then((config) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setWhatsappStatus(resolveWhatsAppSettingsStatus(config));
          })
          .catch((err) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setErrors((prev) => ({
              ...prev,
              whatsapp: getErrorMessage(err, 'Could not load WhatsApp status.'),
            }));
          }),
      );
    }

    if (canManageVoiceSettings(hasPermission, membershipRole)) {
      tasks.push(
        api.voiceAssistant
          .get(requestOrgId)
          .then((assistant) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setVoiceStatus(resolveVoiceSettingsStatus(assistant));
          })
          .catch((err) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setErrors((prev) => ({
              ...prev,
              voice: getErrorMessage(err, 'Could not load Voice status.'),
            }));
          }),
      );
    }

    if (canViewSmsSettingsInSettings(hasPermission, membershipRole)) {
      tasks.push(
        api.sms
          .getConfig(requestOrgId)
          .then((config) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setSmsStatus(resolveSmsSettingsStatus(config));
          })
          .catch((err) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setErrors((prev) => ({
              ...prev,
              sms: getErrorMessage(err, 'Could not load SMS status.'),
            }));
          }),
      );
    }

    await Promise.all(tasks);
    if (isCurrent(requestOrgId, generation)) {
      setLoading(false);
    }
  }, [enabled, hasPermission, isCurrent, membershipRole, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const channels = useMemo<CommunicationSettingsOverviewChannel[]>(() => {
    const items: CommunicationSettingsOverviewChannel[] = [];
    if (canManageWhatsAppSettings(hasPermission, membershipRole)) {
      items.push({
        key: 'whatsapp',
        status: whatsappStatus,
        loading,
        error: errors.whatsapp,
      });
    }
    if (canManageVoiceSettings(hasPermission, membershipRole)) {
      items.push({
        key: 'voice',
        status: voiceStatus,
        loading,
        error: errors.voice,
      });
    }
    if (canViewSmsSettingsInSettings(hasPermission, membershipRole)) {
      items.push({
        key: 'sms',
        status: smsStatus,
        loading,
        error: errors.sms,
      });
    }
    return items;
  }, [
    errors.sms,
    errors.voice,
    errors.whatsapp,
    hasPermission,
    loading,
    membershipRole,
    smsStatus,
    voiceStatus,
    whatsappStatus,
  ]);

  return {
    channels,
    loading,
    reload: load,
  };
}
