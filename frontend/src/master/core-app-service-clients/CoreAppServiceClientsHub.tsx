import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { MasterPageHeader } from '../shell';
import { MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { tServiceClients } from './core-app-service-clients-i18n';
import {
  CORE_APP_SERVICE_CLIENT_KNOWN_SCOPES,
  grantsVisibleForClient,
} from './known-scopes';
import {
  createCoreAppServiceClient,
  useCoreAppServiceClients,
  useCoreAppServiceOrgGrants,
} from './useCoreAppServiceClients';
import type { CoreAppServiceClientSummary } from './types';

export function clearOneTimeSecretState(
  secret: string | null,
  onClear: () => void,
): void {
  if (secret) {
    onClear();
  }
}

function scopeLabelKey(scope: string): string {
  if (scope === 'core:entitlements:read') {
    return 'master.serviceClients.scope.core_entitlements_read';
  }
  if (scope === 'core:app:vehicle:read') {
    return 'master.serviceClients.scope.core_app_vehicle_read';
  }
  return scope;
}

export function CoreAppServiceClientsHub() {
  const { items, loading, error, refresh } = useCoreAppServiceClients();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((c) => c.id === selectedId) ?? null;
  const grantsState = useCoreAppServiceOrgGrants(selectedId);
  const grantsVisible = grantsVisibleForClient(selectedId, grantsState.loadedForClientId);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachOrgId, setAttachOrgId] = useState('');
  const [scopeDraft, setScopeDraft] = useState<string[]>([]);

  const [createForm, setCreateForm] = useState({
    clientId: '',
    displayName: '',
    productSlug: 'FLEET',
    allowedScopes: ['core:app:vehicle:read'] as string[],
  });

  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (selected) {
      setScopeDraft([...selected.allowedScopes]);
    } else {
      setScopeDraft([]);
    }
  }, [selected?.id, selected?.allowedScopes]);

  useEffect(
    () => () => {
      setOneTimeSecret(null);
    },
    [],
  );

  const selectClient = useCallback((id: string) => {
    setOneTimeSecret(null);
    setAttachOrgId('');
    setRefreshWarning(null);
    setSelectedId(id);
  }, []);

  const dismissSecret = useCallback(() => {
    clearOneTimeSecretState(oneTimeSecret, () => setOneTimeSecret(null));
  }, [oneTimeSecret]);

  const refreshGrants = grantsState.refresh;
  const refreshAfterMutation = useCallback(async () => {
    try {
      await Promise.all([refreshGrants(), refresh()]);
      setRefreshWarning(null);
    } catch (e) {
      setRefreshWarning(
        `${tServiceClients('master.serviceClients.refreshFailed')}: ${(e as Error).message}`,
      );
    }
  }, [refreshGrants, refresh]);

  const toggleCreateScope = (scope: string) => {
    setCreateForm((f) => {
      const has = f.allowedScopes.includes(scope);
      return {
        ...f,
        allowedScopes: has
          ? f.allowedScopes.filter((s) => s !== scope)
          : [...f.allowedScopes, scope],
      };
    });
  };

  const toggleDraftScope = (scope: string) => {
    setScopeDraft((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = async () => {
    setBusy(true);
    setMutationError(null);
    setRefreshWarning(null);
    try {
      const created = await createCoreAppServiceClient({
        clientId: createForm.clientId.trim(),
        displayName: createForm.displayName.trim(),
        productSlug: createForm.productSlug,
        allowedScopes: createForm.allowedScopes,
      });
      setOneTimeSecret(created.clientSecret);
      selectClient(created.client.id);
      await refresh();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveScopes = async () => {
    if (!selected) return;
    setBusy(true);
    setMutationError(null);
    setRefreshWarning(null);
    try {
      await api.admin.coreAppServiceClients.update(selected.id, {
        allowedScopes: scopeDraft,
      });
      await refreshAfterMutation();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleClientStatus = async (client: CoreAppServiceClientSummary) => {
    setBusy(true);
    setMutationError(null);
    setRefreshWarning(null);
    try {
      const status = client.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await api.admin.coreAppServiceClients.update(client.id, { status });
      await refreshAfterMutation();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rotateCredential = async (clientId: string) => {
    if (!window.confirm(tServiceClients('master.serviceClients.rotateConfirm'))) {
      return;
    }
    setBusy(true);
    setMutationError(null);
    setRefreshWarning(null);
    try {
      const rotated = await api.admin.coreAppServiceClients.rotateCredential(clientId);
      setOneTimeSecret(rotated.clientSecret);
      await refreshAfterMutation();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="core-app-service-clients-hub">
      <MasterPageHeader
        variant="page"
        title={tServiceClients('master.serviceClients.title')}
        meta={tServiceClients('master.serviceClients.meta')}
        actions={
          <button
            type="button"
            className="sq-btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tServiceClients('master.serviceClients.refresh')}
          </button>
        }
      />

      {loading && !items.length ? <MasterLoadingState variant="card" count={2} /> : null}
      {error ? (
        <MasterErrorState
          title={tServiceClients('master.serviceClients.title')}
          error={error}
          onRetry={() => void refresh()}
        />
      ) : null}
      {mutationError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {mutationError}
        </div>
      ) : null}
      {refreshWarning ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {refreshWarning}
        </div>
      ) : null}

      {oneTimeSecret ? (
        <div
          className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4"
          data-testid="one-time-secret-panel"
        >
          <div className="flex items-center gap-2 font-medium text-amber-100">
            <KeyRound className="h-4 w-4" />
            {tServiceClients('master.serviceClients.secretTitle')}
          </div>
          <code className="mt-2 block break-all rounded bg-black/40 px-3 py-2 text-sm">{oneTimeSecret}</code>
          <button
            type="button"
            className="sq-btn-primary mt-3 rounded-lg px-3 py-1.5 text-sm"
            onClick={dismissSecret}
          >
            {tServiceClients('master.serviceClients.secretDismiss')}
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">
            {tServiceClients('master.serviceClients.newClient')}
          </h2>
          <div className="space-y-3 text-sm">
            <input
              className="sq-input w-full"
              placeholder="clientId"
              value={createForm.clientId}
              onChange={(e) => setCreateForm((f) => ({ ...f, clientId: e.target.value }))}
            />
            <input
              className="sq-input w-full"
              placeholder="Anzeigename"
              value={createForm.displayName}
              onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
            />
            <select
              className="sq-input w-full"
              value={createForm.productSlug}
              onChange={(e) => setCreateForm((f) => ({ ...f, productSlug: e.target.value }))}
            >
              <option value="FLEET">FLEET</option>
              <option value="VYMOD">VYMOD</option>
              <option value="RENTAL">RENTAL</option>
            </select>
            <fieldset className="space-y-2">
              <legend className="text-xs text-white/50">{tServiceClients('master.serviceClients.scopesLabel')}</legend>
              {CORE_APP_SERVICE_CLIENT_KNOWN_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-white/80">
                  <input
                    type="checkbox"
                    checked={createForm.allowedScopes.includes(scope)}
                    onChange={() => toggleCreateScope(scope)}
                  />
                  <span>{tServiceClients(scopeLabelKey(scope))}</span>
                  <span className="text-white/40">({scope})</span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="sq-btn-primary w-full rounded-xl py-2"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              {tServiceClients('master.serviceClients.createDisabled')}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">
            {tServiceClients('master.serviceClients.registered')}
          </h2>
          <ul className="divide-y divide-white/5">
            {items.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className={`flex w-full flex-col gap-1 px-2 py-3 text-left text-sm ${
                    selectedId === client.id ? 'bg-white/5' : ''
                  }`}
                  onClick={() => selectClient(client.id)}
                >
                  <span className="font-medium">{client.displayName}</span>
                  <span className="text-white/50">
                    {client.clientId} · {client.productSlug} · {client.status} · v{client.credentialVersion}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {selected ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">
            {tServiceClients('master.serviceClients.detail')}
          </h2>
          <p className="text-sm text-white/60">
            {tServiceClients('master.serviceClients.activeGrants')}: {selected.activeGrantCount}
          </p>
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-white/40">
              {tServiceClients('master.serviceClients.scopesEdit')}
            </h3>
            <fieldset className="mt-2 space-y-2 text-sm">
              {CORE_APP_SERVICE_CLIENT_KNOWN_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-white/80">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={scopeDraft.includes(scope)}
                    onChange={() => toggleDraftScope(scope)}
                  />
                  <span>{tServiceClients(scopeLabelKey(scope))}</span>
                  <span className="text-white/40">({scope})</span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="sq-btn-secondary mt-3 rounded-lg px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void saveScopes()}
            >
              {tServiceClients('master.serviceClients.scopesSave')}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="sq-btn-secondary rounded-lg px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void toggleClientStatus(selected)}
            >
              {selected.status === 'ACTIVE'
                ? tServiceClients('master.serviceClients.deactivate')
                : tServiceClients('master.serviceClients.activate')}
            </button>
            <button
              type="button"
              className="sq-btn-secondary rounded-lg px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void rotateCredential(selected.id)}
            >
              {tServiceClients('master.serviceClients.rotate')}
            </button>
          </div>
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-white/40">
              {tServiceClients('master.serviceClients.orgGrants')}
            </h3>
            {grantsState.loading ? (
              <p className="text-sm text-white/50">{tServiceClients('master.serviceClients.loadingGrants')}</p>
            ) : null}
            {grantsState.error ? <p className="text-sm text-red-300">{grantsState.error}</p> : null}
            <div className="mt-3 flex gap-2">
              <input
                className="sq-input flex-1"
                placeholder={tServiceClients('master.serviceClients.orgIdPlaceholder')}
                value={attachOrgId}
                onChange={(e) => setAttachOrgId(e.target.value)}
              />
              <button
                type="button"
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-sm"
                disabled={busy || !attachOrgId.trim()}
                onClick={async () => {
                  if (!selected) return;
                  setBusy(true);
                  setMutationError(null);
                  setRefreshWarning(null);
                  try {
                    await api.admin.coreAppServiceClients.attachOrgGrant(
                      selected.id,
                      attachOrgId.trim(),
                    );
                    setAttachOrgId('');
                    await refreshAfterMutation();
                  } catch (e) {
                    setMutationError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {tServiceClients('master.serviceClients.attachGrant')}
              </button>
            </div>
            {grantsVisible ? (
              <ul className="mt-2 space-y-1 text-sm text-white/70">
                {grantsState.grants.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {g.organizationId} — {g.status} (v{g.grantVersion})
                    </span>
                    <button
                      type="button"
                      className="sq-btn-secondary rounded px-2 py-0.5 text-xs"
                      disabled={busy}
                      onClick={async () => {
                        if (!selected) return;
                        setBusy(true);
                        setMutationError(null);
                        setRefreshWarning(null);
                        try {
                          const next = g.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
                          await api.admin.coreAppServiceClients.updateOrgGrant(
                            selected.id,
                            g.organizationId,
                            { status: next },
                          );
                          await refreshAfterMutation();
                        } catch (e) {
                          setMutationError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {g.status === 'ACTIVE'
                        ? tServiceClients('master.serviceClients.revokeGrant')
                        : tServiceClients('master.serviceClients.activateGrant')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}