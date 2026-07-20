import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, type ApiServiceCase, type ApiTask, type Vendor } from '../../../lib/api';
import { DetailDrawer, ErrorState, StatusChip, Timeline } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { FormDialog } from '../../../components/patterns';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { buildMMY } from '../../lib/vehicleMmy';
import { formatCostCents, TASK_PRIORITY_LABEL_DE } from '../../lib/service-task-semantics';
import { ServiceTaskCreateModal } from '../service-center/ServiceTaskCreateModal';
import {
  countOpenServiceCaseTasks,
  deriveServiceCaseCostStatus,
  formatServiceCaseDateTime,
  resolveServiceCaseVehicleDisplay,
  SERVICE_CASE_CATEGORY_LABEL_DE,
  SERVICE_CASE_STATUS_LABEL_DE,
} from './fleet-health-service-case-list';
import {
  buildServiceCaseAuditTimeline,
  extractServiceCaseHealthFindings,
  isActiveServiceCaseStatus,
  SERVICE_CASE_SOURCE_LABEL_DE,
} from './fleet-health-service-case-detail';
import { resolveServiceCasePermissions } from './fleet-health-service-case-permissions';
import {
  canLinkTaskToServiceCase,
  canUnlinkTaskFromServiceCase,
  filterLinkableVehicleTasks,
  hasServiceCaseOpenTaskInconsistency,
} from './service-case-task-actions';
import { useFleetHealthServiceCaseDetail } from './useFleetHealthServiceCaseDetail';

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

interface FleetHealthServiceCaseDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCaseId: string | null;
  initialCase?: ApiServiceCase | null;
  vendors: Vendor[];
  onOpenTask?: (taskId: string) => void;
  onCaseChanged?: () => void;
}

export function FleetHealthServiceCaseDetailDrawer({
  open,
  onOpenChange,
  serviceCaseId,
  initialCase,
  vendors,
  onOpenTask,
  onCaseChanged,
}: FleetHealthServiceCaseDetailDrawerProps) {
  const { orgId, hasPermission, userRole } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [commentDraft, setCommentDraft] = useState('');
  const [mutating, setMutating] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [vehicleTasks, setVehicleTasks] = useState<ApiTask[]>([]);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  const { serviceCase, loading, error, reload, setServiceCase } = useFleetHealthServiceCaseDetail({
    orgId,
    serviceCaseId,
    open,
    initialCase,
  });

  const permissions = useMemo(
    () => resolveServiceCasePermissions({ membershipRole: userRole, hasPermission }),
    [userRole, hasPermission],
  );

  const vehicle = useMemo(
    () => fleetVehicles.find((entry) => entry.id === serviceCase?.vehicleId) ?? null,
    [fleetVehicles, serviceCase?.vehicleId],
  );
  const vehicleDisplay = resolveServiceCaseVehicleDisplay(vehicle);
  const vendorName = useMemo(() => {
    if (!serviceCase?.vendorId) return null;
    return vendors.find((vendor) => vendor.id === serviceCase.vendorId)?.name ?? 'Partner unbekannt';
  }, [serviceCase?.vendorId, vendors]);

  const healthFindings = useMemo(
    () => (serviceCase ? extractServiceCaseHealthFindings(serviceCase) : []),
    [serviceCase],
  );
  const auditTimeline = useMemo(
    () => (serviceCase ? buildServiceCaseAuditTimeline(serviceCase) : []),
    [serviceCase],
  );
  const costStatus = serviceCase ? deriveServiceCaseCostStatus(serviceCase) : null;
  const active = serviceCase ? isActiveServiceCaseStatus(serviceCase.status) : false;
  const openTaskCount = serviceCase ? countOpenServiceCaseTasks(serviceCase) : 0;
  const taskInconsistency = serviceCase ? hasServiceCaseOpenTaskInconsistency(serviceCase) : false;
  const canManageTasks =
    permissions.canUpdate && (hasPermission('tasks', 'write') || userRole === 'ORG_ADMIN');
  const canLinkTasks = serviceCase ? canLinkTaskToServiceCase(serviceCase) && canManageTasks : false;

  const linkableTasks = useMemo(() => {
    if (!serviceCase) return [];
    return filterLinkableVehicleTasks(vehicleTasks, serviceCase.vehicleId, serviceCase.id);
  }, [serviceCase, vehicleTasks]);

  useEffect(() => {
    if (!orgId || !serviceCase || !linkDialogOpen) return;
    let cancelled = false;
    setLinkLoading(true);
    api.tasks
      .forVehicle(orgId, serviceCase.vehicleId)
      .then((rows) => {
        if (!cancelled) setVehicleTasks(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setVehicleTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLinkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, serviceCase, linkDialogOpen]);

  const runMutation = async (fn: () => Promise<ApiServiceCase>, successMessage: string) => {
    if (!orgId || !serviceCase) return;
    setMutating(true);
    try {
      const updated = await fn();
      setServiceCase(updated);
      onCaseChanged?.();
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
    } finally {
      setMutating(false);
    }
  };

  const handleAddComment = async () => {
    if (!orgId || !serviceCase || !commentDraft.trim() || !permissions.canComment) return;
    await runMutation(
      () => api.serviceCases.addComment(orgId, serviceCase.id, commentDraft.trim()),
      'Kommentar gespeichert',
    );
    setCommentDraft('');
  };

  const refreshCase = async () => {
    if (!orgId || !serviceCase) return;
    const updated = await api.serviceCases.get(orgId, serviceCase.id);
    setServiceCase(updated);
    onCaseChanged?.();
  };

  const handleLinkTask = async () => {
    if (!orgId || !serviceCase || !linkTaskId) return;
    setMutating(true);
    try {
      await api.serviceCases.linkTask(orgId, serviceCase.id, linkTaskId);
      await refreshCase();
      setLinkDialogOpen(false);
      setLinkTaskId('');
      toast.success('Aufgabe verknüpft');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verknüpfung fehlgeschlagen');
    } finally {
      setMutating(false);
    }
  };

  const handleUnlinkTask = async (taskId: string) => {
    if (!orgId || !serviceCase) return;
    setMutating(true);
    try {
      await api.serviceCases.unlinkTask(orgId, serviceCase.id, taskId);
      await refreshCase();
      toast.success('Aufgabenverknüpfung getrennt');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trennen fehlgeschlagen');
    } finally {
      setMutating(false);
    }
  };

  const footer =
    active && (permissions.canComplete || permissions.canCancel) ? (
      <div className="flex w-full flex-wrap justify-end gap-2">
        {permissions.canCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={mutating}
            onClick={() =>
              void runMutation(
                () => api.serviceCases.cancel(orgId!, serviceCase!.id),
                'Servicefall storniert',
              )
            }
          >
            Stornieren
          </Button>
        ) : null}
        {permissions.canComplete ? (
          <Button
            type="button"
            size="sm"
            disabled={mutating}
            onClick={() =>
              void runMutation(
                () => api.serviceCases.complete(orgId!, serviceCase!.id),
                'Servicefall abgeschlossen',
              )
            }
          >
            Abschließen
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-xl"
      eyebrow="Servicefall"
      title={serviceCase?.title ?? 'Servicefall'}
      description={
        serviceCase ? (
          <span>
            {SERVICE_CASE_CATEGORY_LABEL_DE[serviceCase.category]} ·{' '}
            {SERVICE_CASE_SOURCE_LABEL_DE[serviceCase.source]}
          </span>
        ) : null
      }
      status={
        serviceCase ? (
          <div className="flex flex-wrap gap-1">
            <StatusChip tone="neutral">{SERVICE_CASE_STATUS_LABEL_DE[serviceCase.status]}</StatusChip>
            {serviceCase.blocksRental ? (
              <StatusChip tone="critical">Mietblockade</StatusChip>
            ) : null}
          </div>
        ) : null
      }
      footer={footer}
    >
      {loading && !serviceCase ? (
        <p className="text-[12px] text-muted-foreground animate-pulse">Servicefall wird geladen…</p>
      ) : null}

      {error && !serviceCase ? (
        <ErrorState compact title="Servicefall konnte nicht geladen werden." description={error}>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
          >
            Erneut laden
          </button>
        </ErrorState>
      ) : null}

      {serviceCase ? (
        <div className="space-y-6">
          {taskInconsistency ? (
            <div className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch-soft)] px-3 py-2.5 text-[11px] text-foreground">
              Dieser abgeschlossene Servicefall hat noch {openTaskCount} offene Aufgabe(n). Aufgaben
              bleiben sichtbar, bis sie erledigt oder getrennt werden — der Fallstatus ändert sich
              nicht automatisch.
            </div>
          ) : null}

          <DetailSection title="Status & Priorität">
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
              <DetailRow label="Status" value={SERVICE_CASE_STATUS_LABEL_DE[serviceCase.status]} />
              <DetailRow label="Priorität" value={TASK_PRIORITY_LABEL_DE[serviceCase.priority]} />
              <DetailRow
                label="Operative Blockade"
                value={
                  serviceCase.blocksRental ? (
                    <StatusChip tone="critical">Mietblockade aktiv</StatusChip>
                  ) : (
                    'Keine Blockade'
                  )
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="Fahrzeug">
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
              <DetailRow label="Kennzeichen" value={vehicleDisplay.licensePlate} />
              <DetailRow label="Fahrzeug" value={vehicle ? buildMMY(vehicle) : vehicleDisplay.vehicleName} />
            </div>
          </DetailSection>

          <DetailSection title="Ursache / Quelle">
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
              <DetailRow label="Quelle" value={SERVICE_CASE_SOURCE_LABEL_DE[serviceCase.source]} />
              <DetailRow
                label="Beschreibung"
                value={serviceCase.description?.trim() || '—'}
              />
            </div>
          </DetailSection>

          <DetailSection title="Verknüpfte Health Findings">
            {healthFindings.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Keine gespeicherten Health-Fundstellen.</p>
            ) : (
              <div className="space-y-2">
                {healthFindings.map((finding) => (
                  <div key={finding.id} className="surface-premium rounded-xl px-3 py-2.5">
                    <p className="text-[12px] font-semibold text-foreground">{finding.label}</p>
                    {finding.detail ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{finding.detail}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title={`Verknüpfte Aufgaben (${openTaskCount} offen)`}>
            {canManageTasks ? (
              <div className="flex flex-wrap gap-2">
                {canLinkTasks ? (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => setTaskCreateOpen(true)}>
                      Aufgabe anlegen
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
                      Aufgabe verknüpfen
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}

            {serviceCase.tasks.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Keine verknüpften Aufgaben.</p>
            ) : (
              <div className="space-y-2">
                {serviceCase.tasks.map((task) => {
                  const showUnlink =
                    canManageTasks && canUnlinkTaskFromServiceCase(serviceCase, task);
                  const openTask = task.status !== 'DONE' && task.status !== 'CANCELLED';
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-xl border border-border/50 surface-elevated px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenTask?.(task.id)}
                        className="min-w-0 flex-1 text-left hover:opacity-80"
                      >
                        <span className="block text-[12px] font-medium text-foreground truncate">
                          {task.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {task.type}
                          {!active && openTask ? ' · Offen trotz abgeschlossenem Fall' : ''}
                        </span>
                      </button>
                      <StatusChip tone={openTask ? 'watch' : 'neutral'}>{task.status}</StatusChip>
                      {showUnlink ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={mutating}
                          onClick={() => void handleUnlinkTask(task.id)}
                        >
                          Trennen
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Partner & Termine">
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
              <DetailRow label="Partner" value={vendorName ?? '—'} />
              <DetailRow
                label="Werkstatttermin"
                value={formatServiceCaseDateTime(serviceCase.scheduledAt) ?? '—'}
              />
              <DetailRow
                label="Erwartete Fertigstellung"
                value={formatServiceCaseDateTime(serviceCase.expectedReadyAt) ?? '—'}
              />
            </div>
          </DetailSection>

          <DetailSection title="Kosten">
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
              <DetailRow label="Kostenstatus" value={costStatus?.label ?? '—'} />
              {permissions.canManageCosts || costStatus?.detail ? (
                <DetailRow label="Betrag" value={costStatus?.detail ?? '—'} />
              ) : (
                <DetailRow label="Betrag" value="—" />
              )}
              {permissions.canManageCosts ? (
                <>
                  <DetailRow
                    label="Geschätzt"
                    value={formatCostCents(serviceCase.estimatedCostCents) ?? '—'}
                  />
                  <DetailRow
                    label="Ist"
                    value={formatCostCents(serviceCase.actualCostCents) ?? '—'}
                  />
                </>
              ) : null}
            </div>
          </DetailSection>

          <DetailSection title="Dokumente">
            <div className="surface-premium rounded-xl p-3 space-y-2.5">
              <DetailRow
                label="Hauptdokument"
                value={serviceCase.documentId ? 'Dokument verknüpft' : '—'}
              />
              {serviceCase.attachments?.length ? (
                <div className="space-y-2">
                  {serviceCase.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-[12px] font-medium text-[color:var(--brand)] hover:underline"
                    >
                      {attachment.fileName ?? attachment.fileUrl}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">Keine Anhänge.</p>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Kommentare">
            {serviceCase.comments?.length ? (
              <div className="space-y-2">
                {serviceCase.comments.map((comment) => (
                  <div key={comment.id} className="surface-premium rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      {formatServiceCaseDateTime(comment.createdAt)}
                    </p>
                    <p className="mt-1 text-[12px] text-foreground whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">Noch keine Kommentare.</p>
            )}

            {permissions.canComment ? (
              <div className="space-y-2">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  rows={3}
                  placeholder="Kommentar hinzufügen…"
                  className="w-full rounded-xl border border-border bg-[color:var(--input-background)] px-3 py-2 text-[12px] outline-none focus:border-[color:var(--brand)]"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={mutating || !commentDraft.trim()}
                  onClick={() => void handleAddComment()}
                >
                  Kommentar speichern
                </Button>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection title="Audit-Timeline">
            {auditTimeline.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Keine Verlaufseinträge verfügbar.</p>
            ) : (
              <Timeline items={auditTimeline} />
            )}
          </DetailSection>
        </div>
      ) : null}

      {serviceCase ? (
        <ServiceTaskCreateModal
          open={taskCreateOpen}
          onOpenChange={setTaskCreateOpen}
          vendors={vendors}
          defaultVehicleId={serviceCase.vehicleId}
          defaultVendorId={serviceCase.vendorId}
          serviceCaseId={serviceCase.id}
          lockVehicle
          onCreated={() => void refreshCase()}
        />
      ) : null}

      <FormDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title="Aufgabe verknüpfen"
        description="Bestehende offene Aufgabe dem Servicefall zuordnen. Fahrzeug muss übereinstimmen."
        maxWidthClassName="sm:max-w-md"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!linkTaskId || mutating || linkLoading}
              onClick={() => void handleLinkTask()}
            >
              Verknüpfen
            </Button>
          </div>
        }
      >
        {linkLoading ? (
          <p className="text-[12px] text-muted-foreground">Aufgaben werden geladen…</p>
        ) : linkableTasks.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Keine passenden offenen Aufgaben für dieses Fahrzeug verfügbar.
          </p>
        ) : (
          <select
            value={linkTaskId}
            onChange={(event) => setLinkTaskId(event.target.value)}
            className="w-full rounded-xl border border-border bg-[color:var(--input-background)] px-3 py-2 text-[12px]"
          >
            <option value="">Aufgabe wählen…</option>
            {linkableTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title} ({task.status})
              </option>
            ))}
          </select>
        )}
      </FormDialog>
    </DetailDrawer>
  );
}
