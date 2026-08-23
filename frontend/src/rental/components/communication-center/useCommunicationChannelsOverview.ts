import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';
import { resolveEmailSettingsStatus } from './communication-email-settings-status';
import {
  resolveSmsSettingsStatus,
  resolveVoiceSettingsStatus,
  resolveWhatsAppSettingsStatus,
  type CommunicationSettingsStatusKind,
} from './communication-settings-status';
import {
  canAccessEmailChannelSettings,
  canManageVoiceSettings,
  canManageWhatsAppSettings,
  canViewSmsSettingsInSettings,
} from './communication-channels-permissions';
import type { HasPermissionFn } from './communication-settings-permissions';

export type CommunicationChannelsOverviewKey = 'whatsapp' | 'voice' | 'sms' | 'email';

export type CommunicationChannelsOverviewItem = {
  key: CommunicationChannelsOverviewKey;
  provider: string;
  status: CommunicationSettingsStatusKind;
  loading: boolean;
  error: string | null;
  accessible: boolean;
};

interface UseCommunicationChannelsOverviewOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
  hasPermission: HasPermissionFn;
  membershipRole?: string | null;
}

export function useCommunicationChannelsOverview({
  orgId,
  enabled = true,
  hasPermission,
  membershipRole,
}: UseCommunicationChannelsOverviewOptions) {
  const { isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [whatsappStatus, setWhatsappStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [voiceStatus, setVoiceStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [smsStatus, setSmsStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [emailStatus, setEmailStatus] = useState<CommunicationSettingsStatusKind>('NOT_CONFIGURED');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({
    whatsapp: null,
    voice: null,
    sms: null,
    email: null,
  });

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setLoading(true);
    setErrors({ whatsapp: null, voice: null, sms: null, email: null });

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
              whatsapp: getErrorMessage(err),
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
              voice: getErrorMessage(err),
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
              sms: getErrorMessage(err),
            }));
          }),
      );
    }

    if (canAccessEmailChannelSettings(membershipRole)) {
      tasks.push(
        api.orgEmail
          .getSettings(requestOrgId)
          .then((settings) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setEmailStatus(resolveEmailSettingsStatus(settings));
          })
          .catch((err) => {
            if (!isCurrent(requestOrgId, generation)) return;
            setErrors((prev) => ({
              ...prev,
              email: getErrorMessage(err),
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

  const channels = useMemo<CommunicationChannelsOverviewItem[]>(() => {
    const items: CommunicationChannelsOverviewItem[] = [];

    const push = (
      key: CommunicationChannelsOverviewKey,
      provider: string,
      status: CommunicationSettingsStatusKind,
      accessible: boolean,
    ) => {
      items.push({
        key,
        provider,
        status,
        loading,
        error: errors[key],
        accessible,
      });
    };

    push(
      'whatsapp',
      'Meta',
      whatsappStatus,
      canManageWhatsAppSettings(hasPermission, membershipRole),
    );
    push(
      'voice',
      'Twilio / ElevenLabs',
      voiceStatus,
      canManageVoiceSettings(hasPermission, membershipRole),
    );
    push(
      'sms',
      'sent.dm',
      smsStatus,
      canViewSmsSettingsInSettings(hasPermission, membershipRole),
    );
    push(
      'email',
      'Resend',
      emailStatus,
      canAccessEmailChannelSettings(membershipRole),
    );

    return items;
  }, [
    emailStatus,
    errors.email,
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
