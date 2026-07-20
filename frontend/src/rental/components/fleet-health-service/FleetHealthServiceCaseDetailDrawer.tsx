import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, type ApiServiceCase, type Vendor } from '../../../lib/api';
import { DetailDrawer, ErrorState, StatusChip, Timeline } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { buildMMY } from '../../lib/vehicleMmy';
import { formatCostCents, TASK_PRIORITY_LABEL_DE } from '../../lib/service-task-semantics';
import {
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

          <DetailSection title="Verknüpfte Aufgaben">
            {serviceCase.tasks.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Keine verknüpften Aufgaben.</p>
            ) : (
              <div className="space-y-2">
                {serviceCase.tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask?.(task.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-border/50 surface-elevated px-3 py-2.5 text-left hover:bg-muted/20"
                  >
                    <span className="text-[12px] font-medium text-foreground">{task.title}</span>
                    <StatusChip tone="neutral">{task.status}</StatusChip>
                  </button>
                ))}
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
    </DetailDrawer>
  );
}
