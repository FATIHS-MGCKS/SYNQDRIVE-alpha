import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PackagePlus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  SectionHeader,
  StatusChip,
} from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { isStepUpRequiredError } from '../../../lib/mfa';
import { MasterErrorState, MasterLoadingState, MasterPageSection } from '../../shell';
import {
  VEHICLE_ACCESS_MODE_LABEL_DE,
  PRODUCT_BUSINESS_STATUS_LABEL_DE,
  businessLaunchStatusForSlug,
  classifyMasterProductApiError,
  isAssignableCatalogProduct,
  isLegacyRetiredProductSlug,
  isSelectableProductSlug,
} from '../../organizations/product-management.policy';
import type {
  AdminCatalogProductRow,
  AdminOrgProductAssignment,
  OrgVehicleListRow,
  VehicleProductGrantRow,
} from '../../organizations/product-management.types';
import { applyMasterProductApiResult } from './product-management-mutations';
import { loadOrgVehiclesForProductGrants } from './product-management-org-vehicles';

type MutationKind =
  | 'assign'
  | 'remove'
  | 'access-mode'
  | 'grant'
  | 'revoke';

interface OrganizationProductsTabProps {
  orgId: string;
}

export function OrganizationProductsTab({ orgId }: OrganizationProductsTabProps) {
  const [catalog, setCatalog] = useState<AdminCatalogProductRow[]>([]);
  const [assignments, setAssignments] = useState<AdminOrgProductAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [assignSlug, setAssignSlug] = useState<string>('RENTAL');
  const [assignOpen, setAssignOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminOrgProductAssignment | null>(null);
  const [broadenTarget, setBroadenTarget] = useState<AdminOrgProductAssignment | null>(null);

  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [grants, setGrants] = useState<VehicleProductGrantRow[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [vehicles, setVehicles] = useState<OrgVehicleListRow[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesLoadComplete, setVehiclesLoadComplete] = useState(true);
  const [vehiclesLoadMeta, setVehiclesLoadMeta] = useState<{ loaded: number; total: number | null } | null>(
    null,
  );

  const mutationInFlight = useRef<Set<string>>(new Set());
  const [, setMutationTick] = useState(0);
  const isMutationActive = (key: string) => mutationInFlight.current.has(key);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, orgProducts] = await Promise.all([
        api.products.list(),
        api.products.listByOrg(orgId),
      ]);
      setCatalog(Array.isArray(cat) ? cat : []);
      setAssignments(Array.isArray(orgProducts) ? orgProducts : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Produktdaten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const assignableCatalog = useMemo(
    () => (catalog ?? []).filter((p) => isAssignableCatalogProduct(p.slug, p.catalogStatus)),
    [catalog],
  );

  const legacyAssignments = useMemo(
    () => assignments.filter((a) => isLegacyRetiredProductSlug(a.productSlug)),
    [assignments],
  );

  const activeAssignments = useMemo(
    () => assignments.filter((a) => !isLegacyRetiredProductSlug(a.productSlug)),
    [assignments],
  );

  const catalogBySlug = useMemo(
    () => Object.fromEntries(catalog.map((c) => [c.slug, c])),
    [catalog],
  );

  const runGuarded = async (key: string, kind: MutationKind, fn: () => Promise<void>) => {
    if (mutationInFlight.current.has(key)) return;
    mutationInFlight.current.add(key);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Aktion fehlgeschlagen';
      if (isStepUpRequiredError(e)) {
        setActionError(classifyMasterProductApiError(403, msg));
      } else {
        setActionError(msg);
      }
    } finally {
      mutationInFlight.current.delete(key);
      setMutationTick((n) => n + 1);
    }
  };

  const loadGrantsAndVehicles = useCallback(
    async (productSlug: string) => {
      setGrantsLoading(true);
      setVehiclesLoading(true);
      try {
        const [grantRows, vehicleLoad] = await Promise.all([
          api.products.listVehicleGrants(orgId, productSlug),
          loadOrgVehiclesForProductGrants(orgId),
        ]);
        setGrants(Array.isArray(grantRows) ? grantRows : []);
        setVehicles(vehicleLoad.vehicles);
        setVehiclesLoadComplete(vehicleLoad.complete);
        setVehiclesLoadMeta({
          loaded: vehicleLoad.loadedCount,
          total: vehicleLoad.reportedTotal,
        });
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Fahrzeugzugriff konnte nicht geladen werden');
      } finally {
        setGrantsLoading(false);
        setVehiclesLoading(false);
      }
    },
    [orgId],
  );

  const toggleExpanded = (slug: string, mode: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(slug);
    if (mode === 'SELECTED_VEHICLES') {
      void loadGrantsAndVehicles(slug);
    }
  };

  const grantedVehicleIds = useMemo(
    () => new Set(grants.filter((g) => g.status === 'ACTIVE').map((g) => g.vehicleId)),
    [grants],
  );

  const vehicleLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) {
      const label = v.vehicleName ?? v.name ?? v.licensePlate ?? v.vin ?? v.id;
      m.set(v.id, label);
    }
    return m;
  }, [vehicles]);

  const assignmentColumns: DataTableColumn<AdminOrgProductAssignment>[] = [
    {
      key: 'product',
      header: 'Produkt',
      cell: (row) => (
        <div>
          <p className="text-sm font-semibold">{row.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{row.productSlug}</p>
        </div>
      ),
    },
    {
      key: 'business',
      header: 'Geschäftsstatus',
      cell: (row) => {
        const st = businessLaunchStatusForSlug(row.productSlug);
        if (!st) return '—';
        const tone =
          st === 'EXISTING_PRODUCT' ? 'success' : st === 'IN_PREPARATION' ? 'warning' : 'neutral';
        return (
          <StatusChip tone={tone} className="!text-xs">
            {PRODUCT_BUSINESS_STATUS_LABEL_DE[st]}
          </StatusChip>
        );
      },
    },
    {
      key: 'entitlement',
      header: 'Entitlement',
      cell: (row) => <StatusChip className="!text-xs">{row.status}</StatusChip>,
    },
    { key: 'plan', header: 'Plan', cell: (row) => row.plan },
    {
      key: 'access',
      header: 'Fahrzeugzugriff',
      cell: (row) => (
        <span className="text-sm">
          {VEHICLE_ACCESS_MODE_LABEL_DE[row.vehicleAccessMode] ?? row.vehicleAccessMode}
        </span>
      ),
    },
    {
      key: 'catalog',
      header: 'Katalog',
      cell: (row) => {
        const cat = catalogBySlug[row.productSlug];
        return cat?.catalogStatus ?? '—';
      },
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex flex-wrap gap-1 justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => toggleExpanded(row.productSlug, row.vehicleAccessMode)}
          >
            Zugriff
          </Button>
          {!isLegacyRetiredProductSlug(row.productSlug) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setRemoveTarget(row)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <MasterLoadingState variant="table" />;
  if (error) return <MasterErrorState title="Produkte" error={error} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-6">
      <MasterPageSection>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <SectionHeader title="Plattform-Produkte" />
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Verwaltung der Organisations-Produktlizenzen über die Plattform-API. Fleet und VYMOD sind
              in Vorbereitung — eine Zuweisung aktiviert keine externe Produktanwendung.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {actionError && (
          <p className="text-sm text-[color:var(--status-critical)] mb-3" role="alert">
            {actionError}
          </p>
        )}

        <DataTable
          columns={assignmentColumns}
          rows={activeAssignments}
          getRowKey={(r) => r.id}
          dense
          empty="Keine aktiven Produktzuweisungen"
        />

        {legacyAssignments.length > 0 && (
          <div className="mt-6 rounded-lg border border-dashed border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Legacy / eingestellt (nur Anzeige)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              TAXI ist kein zukünftiges SYNQDRIVE-Produkt. Bestehende Zuweisungen bleiben sichtbar;
              neue Zuweisungen sind nicht möglich.
            </p>
            <ul className="text-sm space-y-1">
              {legacyAssignments.map((row) => (
                <li key={row.id} className="flex justify-between gap-2">
                  <span>
                    {row.name} ({row.productSlug}) — {row.status}
                  </span>
                  <span className="text-muted-foreground text-xs">{row.plan}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </MasterPageSection>

      <MasterPageSection title="Katalogübersicht">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {catalog.map((p) => {
            const business = businessLaunchStatusForSlug(p.slug);
            const selectable = isSelectableProductSlug(p.slug);
            return (
              <div key={p.id} className="surface-premium p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">{p.name}</h3>
                  <StatusChip className="!text-xs">{p.catalogStatus}</StatusChip>
                </div>
                <p className="text-xs font-mono text-muted-foreground">{p.slug}</p>
                {business && (
                  <StatusChip
                    tone={
                      business === 'EXISTING_PRODUCT'
                        ? 'success'
                        : business === 'IN_PREPARATION'
                          ? 'warning'
                          : 'neutral'
                    }
                    className="!text-xs"
                  >
                    {PRODUCT_BUSINESS_STATUS_LABEL_DE[business]}
                  </StatusChip>
                )}
                {!selectable && (
                  <p className="text-xs text-muted-foreground">Nicht zur Neuzuweisung verfügbar</p>
                )}
              </div>
            );
          })}
        </div>
      </MasterPageSection>

      <MasterPageSection title="Produkt zuweisen">
        <div className="flex flex-wrap items-end gap-3 max-w-xl">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold">Produkt</label>
            <select
              className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-muted text-sm"
              value={assignSlug}
              onChange={(e) => setAssignSlug(e.target.value)}
            >
              {assignableCatalog.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>
          <Button type="button" className="gap-2" onClick={() => setAssignOpen(true)}>
            <PackagePlus className="w-4 h-4" />
            Zuweisen…
          </Button>
        </div>
      </MasterPageSection>

      {expandedSlug && (() => {
        const row = assignments.find((a) => a.productSlug === expandedSlug);
        if (!row) return null;
        const isSelected = row.vehicleAccessMode === 'SELECTED_VEHICLES';
        return (
          <MasterPageSection title={`Fahrzeugzugriff — ${row.name}`}>
            <p className="text-sm text-muted-foreground mb-3">
              Aktueller Modus:{' '}
              <strong>
                {VEHICLE_ACCESS_MODE_LABEL_DE[row.vehicleAccessMode] ?? row.vehicleAccessMode}
              </strong>
              {isSelected && (
                <>
                  {' '}
                  · {grantsLoading ? '…' : `${grantedVehicleIds.size} explizite Grants`}
                </>
              )}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {row.vehicleAccessMode === 'SELECTED_VEHICLES' ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setBroadenTarget(row)}
                >
                  Auf organisationsweit erweitern…
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isMutationActive(`access:${row.productSlug}`)}
                  onClick={() =>
                    void runGuarded(`access:${row.productSlug}`, 'access-mode', async () => {
                      const res = await api.products.patchVehicleAccessModeResult(orgId, row.productSlug, {
                        vehicleAccessMode: 'SELECTED_VEHICLES',
                        ifCurrentVehicleAccessMode: 'ORGANIZATION_WIDE',
                      });
                      await applyMasterProductApiResult(
                        res.status,
                        res.errorMessage,
                        async () => {
                          await refresh();
                          setExpandedSlug(row.productSlug);
                          await loadGrantsAndVehicles(row.productSlug);
                        },
                        setActionError,
                      );
                    })
                  }
                >
                  Auf ausgewählte Fahrzeuge einschränken
                </Button>
              )}
            </div>

            {isSelected && (
              <div className="space-y-4">
                {grantsLoading || vehiclesLoading ? (
                  <MasterLoadingState variant="rows" count={3} />
                ) : (
                  <>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Ausgewählte Fahrzeuge (aktive Grants)</h4>
                      {grants.length === 0 ? (
                        <EmptyState compact title="Keine aktiven Grants" />
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {grants.map((g) => (
                            <li
                              key={`${g.vehicleId}-${g.grantVersion}`}
                              className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2"
                            >
                              <span>
                                {vehicleLabelById.get(g.vehicleId) ?? g.vehicleId}
                                <span className="text-xs text-muted-foreground ml-2 font-mono">
                                  v{g.grantVersion}
                                </span>
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={isMutationActive(`revoke:${g.vehicleId}`)}
                                onClick={() =>
                                  void runGuarded(`revoke:${g.vehicleId}`, 'revoke', async () => {
                                    const res = await api.products.revokeVehicleProductResult(
                                      orgId,
                                      g.vehicleId,
                                      row.productSlug,
                                    );
                                    await applyMasterProductApiResult(
                                      res.status,
                                      res.errorMessage,
                                      async () => {
                                        await loadGrantsAndVehicles(row.productSlug);
                                      },
                                      setActionError,
                                    );
                                  })
                                }
                              >
                                Widerrufen
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold mb-2">Grant vergeben</h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        Fahrzeuge werden paginiert geladen. Nur Fahrzeuge ohne aktiven Grant werden angeboten.
                      </p>
                      {!vehiclesLoadComplete && vehiclesLoadMeta && (
                        <p className="text-xs text-[color:var(--status-watch)] mb-2" role="status">
                          Nur {vehiclesLoadMeta.loaded} von{' '}
                          {vehiclesLoadMeta.total ?? 'unbekannt vielen'} Fahrzeugen geladen (Listenlimit).
                          Grant-Liste kann unvollständig sein.
                        </p>
                      )}
                      <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y">
                        {vehicles
                          .filter((v) => !grantedVehicleIds.has(v.id))
                          .map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <span>{v.vehicleName ?? v.name ?? v.licensePlate ?? v.id}</span>
                              <Button
                                type="button"
                                size="sm"
                                disabled={isMutationActive(`grant:${v.id}`)}
                                onClick={() =>
                                  void runGuarded(`grant:${v.id}`, 'grant', async () => {
                                    const res = await api.products.grantVehicleProductResult(
                                      orgId,
                                      v.id,
                                      row.productSlug,
                                    );
                                    await applyMasterProductApiResult(
                                      res.status,
                                      res.errorMessage,
                                      async () => {
                                        await loadGrantsAndVehicles(row.productSlug);
                                      },
                                      setActionError,
                                    );
                                  })
                                }
                              >
                                Grant
                              </Button>
                            </div>
                          ))}
                        {vehicles.filter((v) => !grantedVehicleIds.has(v.id)).length === 0 && (
                          <p className="p-3 text-sm text-muted-foreground">Keine weiteren Fahrzeuge</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {!isSelected && (
              <p className="text-sm text-muted-foreground">
                Im Modus „Organisationsweit“ sind alle berechtigten Fahrzeuge der Organisation über die
                Backend-Policy abgedeckt; explizite Grants sind nicht erforderlich.
              </p>
            )}
          </MasterPageSection>
        );
      })()}

      <ConfirmDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Produkt zuweisen"
        description={`Produkt ${assignSlug} dieser Organisation zuweisen? Für Fleet/VYMOD wird keine externe App aktiviert.`}
        confirmLabel="Zuweisen"
        loading={isMutationActive('assign')}
        onConfirm={async () => {
          await runGuarded('assign', 'assign', async () => {
            const res = await api.products.assignResult({
              orgId,
              productSlug: assignSlug,
            });
            await applyMasterProductApiResult(
              res.status,
              res.errorMessage,
              async () => {
                setAssignOpen(false);
                await refresh();
              },
              setActionError,
            );
          });
        }}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Produktzuweisung entfernen"
        description={
          removeTarget
            ? `Zuweisung ${removeTarget.name} (${removeTarget.productSlug}) für diese Organisation entfernen?`
            : ''
        }
        confirmLabel="Entfernen"
        tone="critical"
        loading={isMutationActive('remove')}
        onConfirm={async () => {
          if (!removeTarget) return;
          const slug = removeTarget.productSlug;
          await runGuarded('remove', 'remove', async () => {
            const res = await api.products.removeResult(orgId, slug);
            await applyMasterProductApiResult(
              res.status,
              res.errorMessage,
              async () => {
                setRemoveTarget(null);
                if (expandedSlug === slug) setExpandedSlug(null);
                await refresh();
              },
              setActionError,
            );
          });
        }}
      />

      <ConfirmDialog
        open={Boolean(broadenTarget)}
        onOpenChange={(o) => !o && setBroadenTarget(null)}
        title="Zugriff erweitern"
        description="Organisationsweiter Fahrzeugzugriff gewährt allen berechtigten Fahrzeugen Zugriff auf dieses Produkt. Fortfahren?"
        confirmLabel="Erweitern"
        tone="critical"
        loading={isMutationActive('broaden')}
        onConfirm={async () => {
          if (!broadenTarget) return;
          const slug = broadenTarget.productSlug;
          await runGuarded('broaden', 'access-mode', async () => {
            const res = await api.products.patchVehicleAccessModeResult(orgId, slug, {
              vehicleAccessMode: 'ORGANIZATION_WIDE',
              ifCurrentVehicleAccessMode: 'SELECTED_VEHICLES',
            });
            await applyMasterProductApiResult(
              res.status,
              res.errorMessage,
              async () => {
                setBroadenTarget(null);
                await refresh();
                setExpandedSlug(slug);
              },
              setActionError,
            );
          });
        }}
      />
    </div>
  );
}