import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type LegalDocumentDto,
  type Station,
  type TenantOrganizationProfileDto,
} from '../../../../lib/api';
import { useLanguage } from '../../../i18n/LanguageContext';
import { draftToUpdatePayload, type CompanyDraft } from './company-utils';

export interface ActivityLogRow {
  id: string;
  action: string;
  entity: string;
  description: string;
  userName: string;
  createdAt: string;
}

export function useCompanyCenter(orgId: string | undefined) {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<TenantOrganizationProfileDto | null>(null);
  const [legalDocs, setLegalDocs] = useState<LegalDocumentDto[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!orgId?.trim()) {
      setLoading(false);
      setLoadError(t('settings.company.toast.noOrg'));
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.organizations.getProfile(orgId);
      setProfile(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : t('settings.company.loadErrorTitle'),
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  const loadLegalDocs = useCallback(async () => {
    if (!orgId?.trim()) return;
    setDocsLoading(true);
    try {
      const list = await api.legalDocuments.list(orgId);
      setLegalDocs(Array.isArray(list) ? list : []);
    } catch {
      setLegalDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, [orgId]);

  const loadStations = useCallback(async () => {
    if (!orgId?.trim()) {
      setStations([]);
      return;
    }
    try {
      const rows = await api.stations.list(orgId);
      setStations(Array.isArray(rows) ? rows : []);
    } catch {
      setStations([]);
    }
  }, [orgId]);

  const loadActivity = useCallback(async () => {
    if (!orgId?.trim()) return;
    setActivityLoading(true);
    try {
      const res = await api.activityLog.listByOrg(orgId, {
        entity: 'ORGANIZATION',
        limit: 15,
      });
      const rows = Array.isArray(res) ? res : (res?.data ?? []);
      setActivity(
        rows.map((r: ActivityLogRow) => ({
          id: r.id,
          action: r.action,
          entity: r.entity,
          description: r.description,
          userName: r.userName,
          createdAt: r.createdAt,
        })),
      );
    } catch {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadProfile();
    void loadLegalDocs();
    void loadStations();
    void loadActivity();
  }, [loadProfile, loadLegalDocs, loadStations, loadActivity]);

  const saveProfile = useCallback(
    async (draft: CompanyDraft) => {
      if (!orgId?.trim()) throw new Error(t('settings.company.toast.noOrg'));
      setSaving(true);
      try {
        const data = await api.organizations.updateProfile(orgId, draftToUpdatePayload(draft));
        setProfile(data);
        toast.success(t('settings.company.toast.saved'));
        await loadActivity();
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('settings.company.toast.saveFailed');
        toast.error(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [orgId, loadActivity, t],
  );

  const uploadLogo = useCallback(
    async (file: File) => {
      if (!orgId?.trim()) throw new Error(t('settings.company.toast.noOrg'));
      setLogoUploading(true);
      try {
        const { url } = await api.organizations.uploadLogo(orgId, file);
        setProfile((p) => (p ? { ...p, logoUrl: url } : p));
        toast.success(t('settings.company.toast.logoUploaded'));
        return url;
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('settings.company.toast.logoUploadFailed');
        toast.error(msg);
        throw err;
      } finally {
        setLogoUploading(false);
      }
    },
    [orgId, t],
  );

  const removeLogo = useCallback(async () => {
    if (!orgId?.trim()) return;
    setLogoUploading(true);
    try {
      const data = await api.organizations.updateProfile(orgId, { logoUrl: null });
      setProfile(data);
      toast.success(t('settings.company.toast.logoRemoved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.company.toast.logoRemoveFailed'));
      throw err;
    } finally {
      setLogoUploading(false);
    }
  }, [orgId, t]);

  return {
    profile,
    legalDocs,
    stations,
    activity,
    loading,
    loadError,
    saving,
    logoUploading,
    docsLoading,
    activityLoading,
    loadProfile,
    loadLegalDocs,
    loadActivity,
    saveProfile,
    uploadLogo,
    removeLogo,
  };
}
