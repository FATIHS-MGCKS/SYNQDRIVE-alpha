import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type CreateDataAuthorizationPayload,
  type DataAuthorizationAuditEntry,
  type DataAuthorizationDto,
  type DataAuthorizationStatsDto,
} from '../../../../lib/api';
import type { DataAuthorizationFilters } from './data-authorization.utils';
import { serverListParams } from './data-authorization.utils';

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Unbekannter Fehler';
}

export function useDataAuthorizationCenter(orgId: string | null) {
  const [authorizations, setAuthorizations] = useState<DataAuthorizationDto[]>([]);
  const [stats, setStats] = useState<DataAuthorizationStatsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const lastFiltersRef = useRef<DataAuthorizationFilters | undefined>(undefined);

  const load = useCallback(
    async (filters?: DataAuthorizationFilters) => {
      lastFiltersRef.current = filters;
      if (!orgId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = filters ? serverListParams(filters) : undefined;
        const [list, st] = await Promise.all([
          api.dataAuthorizations.list(orgId, params),
          api.dataAuthorizations.stats(orgId),
        ]);
        setAuthorizations(list);
        setStats(st);
      } catch (err) {
        setAuthorizations([]);
        setStats(null);
        setError('Datenfreigaben konnten nicht geladen werden.');
        toast.error(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  const reload = useCallback(async () => {
    await load(lastFiltersRef.current);
  }, [load]);

  const grant = useCallback(
    async (id: string, notes?: string) => {
      if (!orgId) return null;
      setActionId(id);
      try {
        const updated = await api.dataAuthorizations.grant(
          orgId,
          id,
          notes ? { notes } : undefined,
        );
        toast.success('Freigabe genehmigt');
        await reload();
        return updated;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setActionId(null);
      }
    },
    [orgId, reload],
  );

  const revoke = useCallback(
    async (id: string, reason?: string) => {
      if (!orgId) return null;
      setActionId(id);
      try {
        const updated = await api.dataAuthorizations.revoke(
          orgId,
          id,
          reason ? { reason } : undefined,
        );
        toast.success('Freigabe widerrufen');
        await reload();
        return updated;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setActionId(null);
      }
    },
    [orgId, reload],
  );

  const syncSystem = useCallback(async () => {
    if (!orgId) return false;
    setActionId('sync');
    try {
      await api.dataAuthorizations.syncSystem(orgId);
      await reload();
      toast.success('Systemfreigaben synchronisiert');
      return true;
    } catch (err) {
      toast.error(extractErrorMessage(err));
      return false;
    } finally {
      setActionId(null);
    }
  }, [orgId, reload]);

  const create = useCallback(
    async (payload: CreateDataAuthorizationPayload) => {
      if (!orgId) return null;
      setActionId('create');
      try {
        const created = await api.dataAuthorizations.create(orgId, payload);
        toast.success('Freigabe erstellt — Status: Ausstehend');
        await reload();
        return created;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setActionId(null);
      }
    },
    [orgId, reload],
  );

  const loadAuditLog = useCallback(
    async (limit = 30): Promise<DataAuthorizationAuditEntry[]> => {
      if (!orgId) return [];
      try {
        return await api.dataAuthorizations.auditLog(orgId, limit);
      } catch (err) {
        toast.error('Audit-Verlauf konnte nicht geladen werden.');
        return [];
      }
    },
    [orgId],
  );

  const fetchById = useCallback(
    async (id: string): Promise<DataAuthorizationDto | null> => {
      if (!orgId) return null;
      try {
        return await api.dataAuthorizations.get(orgId, id);
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      }
    },
    [orgId],
  );

  return {
    authorizations,
    stats,
    loading,
    error,
    actionId,
    load,
    reload,
    grant,
    revoke,
    syncSystem,
    create,
    loadAuditLog,
    fetchById,
  };
}
