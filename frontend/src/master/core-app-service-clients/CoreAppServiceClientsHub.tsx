import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { MasterPageHeader } from '../shell';
import { MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
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

export function CoreAppServiceClientsHub() {
  const { items, loading, error, refresh } = useCoreAppServiceClients();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((c) => c.id === selectedId) ?? null;
  const grantsState = useCoreAppServiceOrgGrants(selectedId);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachOrgId, setAttachOrgId] = useState('');

  const [createForm, setCreateForm] = useState({
    clientId: '',
    displayName: '',
    productSlug: 'FLEET',
    allowedScopes: 'core:app:vehicle:read',
  });

  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const dismissSecret = useCallback(() => {
    clearOneTimeSecretState(oneTimeSecret, () => setOneTimeSecret(null));
  }, [oneTimeSecret]);

  const handleCreate = async () => {
    setBusy(true);
    setMutationError(null);
    try {
      const scopes = createForm.allowedScopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const created = await createCoreAppServiceClient({
        clientId: createForm.clientId.trim(),
        displayName: createForm.displayName.trim(),
        productSlug: createForm.productSlug,
        allowedScopes: scopes,
      });
      setOneTimeSecret(created.clientSecret);
      setSelectedId(created.client.id);
      await refresh();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleClientStatus = async (client: CoreAppServiceClientSummary) => {
    setBusy(true);
    setMutationError(null);
    try {
      const status = client.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await api.admin.coreAppServiceClients.update(client.id, { status });
      await refresh();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rotateCredential = async (clientId: string) => {
    if (!window.confirm('Client-Secret wirklich rotieren? Bestehende Tokens werden ungültig.')) {
      return;
    }
    setBusy(true);
    setMutationError(null);
    try {
      const rotated = await api.admin.coreAppServiceClients.rotateCredential(clientId);
      setOneTimeSecret(rotated.clientSecret);
      await refresh();
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
        title="Core-App Service Clients"
        meta="M2M-Clients für externe Produkt-Backends (FLEET, VYMOD, RENTAL). Secrets werden nur einmal angezeigt."
        actions={
          <button
            type="button"
            className="sq-btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </button>
        }
      />

      {loading && !items.length ? <MasterLoadingState label="Clients werden geladen…" /> : null}
      {error ? <MasterErrorState message={error} onRetry={() => void refresh()} /> : null}
      {mutationError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {mutationError}
        </div>
      ) : null}

      {oneTimeSecret ? (
        <div
          className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4"
          data-testid="one-time-secret-panel"
        >
          <div className="flex items-center gap-2 font-medium text-amber-100">
            <KeyRound className="h-4 w-4" />
            Client-Secret (nur einmal sichtbar)
          </div>
          <code className="mt-2 block break-all rounded bg-black/40 px-3 py-2 text-sm">{oneTimeSecret}</code>
          <button
            type="button"
            className="sq-btn-primary mt-3 rounded-lg px-3 py-1.5 text-sm"
            onClick={dismissSecret}
          >
            Schließen und aus Speicher entfernen
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Neuer Client</h2>
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
            <input
              className="sq-input w-full"
              placeholder="Scopes (kommagetrennt)"
              value={createForm.allowedScopes}
              onChange={(e) => setCreateForm((f) => ({ ...f, allowedScopes: e.target.value }))}
            />
            <button
              type="button"
              className="sq-btn-primary w-full rounded-xl py-2"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              Client erstellen (DISABLED)
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Registrierte Clients</h2>
          <ul className="divide-y divide-white/5">
            {items.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className={`flex w-full flex-col gap-1 px-2 py-3 text-left text-sm ${
                    selectedId === client.id ? 'bg-white/5' : ''
                  }`}
                  onClick={() => setSelectedId(client.id)}
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
          <h2 className="mb-3 text-sm font-semibold text-white/80">Client-Detail</h2>
          <p className="text-sm text-white/60">Scopes: {selected.allowedScopes.join(', ') || '—'}</p>
          <p className="text-sm text-white/60">Aktive Org-Grants: {selected.activeGrantCount}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="sq-btn-secondary rounded-lg px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void toggleClientStatus(selected)}
            >
              {selected.status === 'ACTIVE' ? 'Deaktivieren' : 'Aktivieren'}
            </button>
            <button
              type="button"
              className="sq-btn-secondary rounded-lg px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void rotateCredential(selected.id)}
            >
              Secret rotieren
            </button>
          </div>
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-white/40">Organisations-Grants</h3>
            {grantsState.loading ? <p className="text-sm text-white/50">Lade…</p> : null}
            {grantsState.error ? <p className="text-sm text-red-300">{grantsState.error}</p> : null}
            <div className="mt-3 flex gap-2">
              <input
                className="sq-input flex-1"
                placeholder="Organisation-ID"
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
                  try {
                    await api.admin.coreAppServiceClients.attachOrgGrant(
                      selected.id,
                      attachOrgId.trim(),
                    );
                    setAttachOrgId('');
                    await grantsState.refresh();
                    await refresh();
                  } catch (e) {
                    setMutationError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Grant anlegen (REVOKED)
              </button>
            </div>
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
                      try {
                        const next = g.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
                        await api.admin.coreAppServiceClients.updateOrgGrant(
                          selected.id,
                          g.organizationId,
                          { status: next },
                        );
                        await grantsState.refresh();
                        await refresh();
                      } catch (e) {
                        setMutationError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {g.status === 'ACTIVE' ? 'Widerrufen' : 'Aktivieren'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}