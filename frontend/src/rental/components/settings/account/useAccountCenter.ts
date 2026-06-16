import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type AccountMeDto,
  type AccountNotificationCategory,
  type AccountSessionDto,
  type Station,
} from '../../../../lib/api';
import { patchStoredUser } from '../../../../lib/auth';
import type { NotificationRow, PreferencesDraft, ProfileDraft } from './account-utils';

export function useAccountCenter(orgId: string | undefined) {
  const [account, setAccount] = useState<AccountMeDto | null>(null);
  const [sessions, setSessions] = useState<AccountSessionDto[]>([]);
  const [stations, setStations] = useState<Station[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [stationsLoading, setStationsLoading] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const syncStoredUser = useCallback((data: AccountMeDto) => {
    patchStoredUser({
      name: data.user.displayName,
      email: data.user.email,
    });
  }, []);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.account.me();
      setAccount(data);
      syncStoredUser(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Account konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [syncStoredUser]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const rows = await api.account.sessions();
      setSessions(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sitzungen konnten nicht geladen werden');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadStations = useCallback(async () => {
    if (!orgId?.trim()) {
      setStations([]);
      return;
    }
    setStationsLoading(true);
    try {
      const rows = await api.stations.list(orgId, { selectableOnly: true });
      setStations(rows);
    } catch {
      setStations([]);
    } finally {
      setStationsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    void loadStations();
  }, [loadStations]);

  const updateProfile = useCallback(
    async (draft: ProfileDraft) => {
      setSavingProfile(true);
      try {
        const data = await api.account.updateProfile({
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          phone: draft.phone.trim() || null,
          mobile: draft.mobile.trim() || null,
        });
        setAccount(data);
        syncStoredUser(data);
        toast.success('Profil gespeichert');
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Profil konnte nicht gespeichert werden';
        toast.error(msg);
        throw err;
      } finally {
        setSavingProfile(false);
      }
    },
    [syncStoredUser],
  );

  const updatePreferences = useCallback(
    async (draft: PreferencesDraft) => {
      setSavingPreferences(true);
      try {
        const data = await api.account.updatePreferences({
          language: draft.language,
          timezone: draft.timezone,
          dateFormat: draft.dateFormat,
          defaultStationId: draft.defaultStationId || null,
          defaultLandingPage: draft.defaultLandingPage || null,
        });
        setAccount(data);
        toast.success('Arbeitspräferenzen gespeichert');
        return data;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Präferenzen konnten nicht gespeichert werden';
        toast.error(msg);
        throw err;
      } finally {
        setSavingPreferences(false);
      }
    },
    [],
  );

  const updateNotifications = useCallback(async (rows: NotificationRow[]) => {
    setSavingNotifications(true);
    try {
      const data = await api.account.updateNotifications({
        preferences: rows.map((r) => ({
          category: r.category as AccountNotificationCategory,
          inApp: r.inApp,
          email: r.email,
          push: r.push,
          sms: r.sms,
          criticalOnly: r.criticalOnly,
        })),
      });
      setAccount(data);
      toast.success('Benachrichtigungen gespeichert');
      return data;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Benachrichtigungen konnten nicht gespeichert werden';
      toast.error(msg);
      throw err;
    } finally {
      setSavingNotifications(false);
    }
  }, []);

  const changePassword = useCallback(
    async (payload: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
      revokeOtherSessions?: boolean;
    }) => {
      setChangingPassword(true);
      try {
        const result = await api.account.changePassword(payload);
        toast.success(result.message || 'Passwort aktualisiert');
        if (payload.revokeOtherSessions) {
          await loadSessions();
        }
        const refreshed = await api.account.me();
        setAccount(refreshed);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Passwort konnte nicht geändert werden';
        toast.error(msg);
        throw err;
      } finally {
        setChangingPassword(false);
      }
    },
    [loadSessions],
  );

  const revokeOtherSessions = useCallback(async () => {
    setRevokingSessions(true);
    try {
      const result = await api.account.revokeOtherSessions();
      toast.success(`${result.revoked} andere Sitzung(en) beendet`);
      await loadSessions();
      const refreshed = await api.account.me();
      setAccount(refreshed);
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sitzungen konnten nicht beendet werden');
      throw err;
    } finally {
      setRevokingSessions(false);
    }
  }, [loadSessions]);

  const revokeSession = useCallback(
    async (sessionId: string) => {
      setRevokingSessionId(sessionId);
      try {
        await api.account.revokeSession(sessionId);
        toast.success('Sitzung beendet');
        await loadSessions();
        const refreshed = await api.account.me();
        setAccount(refreshed);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Sitzung konnte nicht beendet werden');
        throw err;
      } finally {
        setRevokingSessionId(null);
      }
    },
    [loadSessions],
  );

  return {
    account,
    sessions,
    stations,
    loading,
    loadError,
    sessionsLoading,
    stationsLoading,
    savingProfile,
    savingPreferences,
    savingNotifications,
    changingPassword,
    revokingSessions,
    revokingSessionId,
    loadAccount,
    loadSessions,
    loadStations,
    updateProfile,
    updatePreferences,
    updateNotifications,
    changePassword,
    revokeOtherSessions,
    revokeSession,
  };
}
