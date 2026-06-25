import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type TechnicalObservation,
  type TechnicalObservationAffectedArea,
  type TechnicalObservationCategory,
  type TechnicalObservationListResponse,
  type TechnicalObservationSeverity,
  type RentalHealthModule,
} from '../../../lib/api';
import { Icon } from '../ui/Icon';
import { SkeletonCard } from '../../../components/patterns';
import {
  OBSERVATION_AREAS,
  OBSERVATION_CATEGORIES,
  OBSERVATION_SEVERITIES,
  hasActiveLinks,
  observationAreaLabel,
  observationCategoryLabel,
  observationClosedAt,
  observationSeverityLabel,
  observationSourceLabel,
  observationStatusLabel,
  rentalComplaintsModuleSummary,
  severityChipClass,
} from '../../lib/technical-observations-ui';

const EMPTY_FORM = {
  description: '',
  category: 'other' as TechnicalObservationCategory,
  affectedArea: '' as '' | TechnicalObservationAffectedArea,
  severity: 'medium' as TechnicalObservationSeverity,
  blocksRental: false,
};

export interface TechnicalObservationsHealthModuleProps {
  vehicleId?: string;
  orgId?: string;
  complaintsModule?: RentalHealthModule | null;
  rentalHealthLoading?: boolean;
  onOpenExistingTask?: (taskId: string) => void;
  onHealthRefetch?: () => void;
  quickCardClass: string;
  quickCardHeaderClass: string;
  quickCardTitleClass: string;
  quickCardBodyClass: string;
  quickCardFooterClass: string;
}

function formatDeDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TechnicalObservationsHealthModule({
  vehicleId,
  orgId,
  complaintsModule,
  rentalHealthLoading,
  onOpenExistingTask,
  onHealthRefetch,
  quickCardClass,
  quickCardHeaderClass,
  quickCardTitleClass,
  quickCardBodyClass,
  quickCardFooterClass,
}: TechnicalObservationsHealthModuleProps) {
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [data, setData] = useState<TechnicalObservationListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    description: '',
    category: 'other' as TechnicalObservationCategory,
    affectedArea: '' as '' | TechnicalObservationAffectedArea,
    severity: 'medium' as TechnicalObservationSeverity,
    blocksRental: false,
  });

  const reload = useCallback(async () => {
    if (!vehicleId || !orgId) {
      setData(null);
      setLoadError(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const rows = await api.vehicles.technicalObservations.list(orgId, vehicleId);
      setData(rows);
    } catch {
      setData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const afterMutation = useCallback(async () => {
    await reload();
    onHealthRefetch?.();
  }, [reload, onHealthRefetch]);

  const openModal = () => {
    setOpen(true);
    setClosing(false);
    requestAnimationFrame(() => setAnimating(true));
    void reload();
  };

  const closeModal = () => {
    setAnimating(false);
    setClosing(true);
    setEditingId(null);
    setFormError(null);
    setActionError(null);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 400);
  };

  const submitObservation = async () => {
    if (!vehicleId || !orgId || !form.description.trim() || !form.category) return;
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(false);
    try {
      await api.vehicles.technicalObservations.create(orgId, vehicleId, {
        description: form.description.trim(),
        category: form.category,
        affectedArea: form.affectedArea || undefined,
        severity: form.severity,
        blocksRental: form.blocksRental,
        source: 'staff_inspection',
      });
      setForm(EMPTY_FORM);
      setFormSuccess(true);
      await afterMutation();
      window.setTimeout(() => setFormSuccess(false), 3000);
    } catch {
      setFormError('Beobachtung konnte nicht gespeichert werden.');
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionKey(key);
    setActionError(null);
    try {
      await fn();
      await afterMutation();
    } catch {
      setActionError('Aktion fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setActionKey(null);
    }
  };

  const saveEdit = async (observationId: string) => {
    if (!vehicleId || !orgId || !editDraft.description.trim()) return;
    await runAction(`${observationId}-edit`, async () => {
      await api.vehicles.technicalObservations.update(orgId, vehicleId, observationId, {
        description: editDraft.description.trim(),
        category: editDraft.category,
        affectedArea: editDraft.affectedArea || undefined,
        severity: editDraft.severity,
        blocksRental: editDraft.blocksRental,
      });
      setEditingId(null);
    });
  };

  const active = data?.active ?? [];
  const history = data?.history ?? [];
  const activeCount = active.length;
  const moduleSummary = rentalComplaintsModuleSummary(complaintsModule);
  const hasRentalBlock = active.some((o) => o.blocksRental);

  const quickAccent = loadError
    ? 'sq-tone-nodata'
    : activeCount > 0 || complaintsModule?.state === 'critical'
      ? 'sq-tone-watch'
      : loading || rentalHealthLoading
        ? 'sq-tone-nodata'
        : 'sq-tone-success';

  const renderObservationCard = (obs: TechnicalObservation, isHistory: boolean) => {
    const isEditing = editingId === obs.id;
    const busy = Boolean(actionKey && actionKey.includes(obs.id));

    return (
      <div
        key={obs.id}
        className={`rounded-xl p-3 border bg-muted border-border ${isHistory ? 'opacity-90' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-background border border-border">
              {observationCategoryLabel(obs.category)}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${severityChipClass(obs.severity)}`}>
              {observationSeverityLabel(obs.severity)}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide sq-chip-neutral">
              {observationStatusLabel(obs.status)}
            </span>
            {obs.blocksRental && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide sq-chip-critical">
                Vermietung blockiert
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {formatDeDateTime(obs.createdAt)}
          </span>
        </div>

        {isEditing ? (
          <div className="space-y-2 mb-2">
            <textarea
              value={editDraft.description}
              onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm border bg-background border-border text-foreground outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={editDraft.category}
                onChange={(e) =>
                  setEditDraft((d) => ({
                    ...d,
                    category: e.target.value as TechnicalObservationCategory,
                  }))
                }
                className="rounded-lg px-2 py-1.5 text-xs border bg-background border-border"
              >
                {OBSERVATION_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select
                value={editDraft.severity}
                onChange={(e) =>
                  setEditDraft((d) => ({
                    ...d,
                    severity: e.target.value as TechnicalObservationSeverity,
                  }))
                }
                className="rounded-lg px-2 py-1.5 text-xs border bg-background border-border"
              >
                {OBSERVATION_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={editDraft.blocksRental}
                onChange={(e) => setEditDraft((d) => ({ ...d, blocksRental: e.target.checked }))}
              />
              Vermietung blockieren
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !editDraft.description.trim()}
                onClick={() => void saveEdit(obs.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold sq-tone-brand text-white disabled:opacity-50"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-background"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={`text-sm text-foreground ${isHistory ? 'text-foreground/85' : ''}`}>
              {obs.title ? <span className="font-semibold block mb-0.5">{obs.title}</span> : null}
              {obs.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {observationAreaLabel(obs.affectedArea) && (
                <span>Bereich: {observationAreaLabel(obs.affectedArea)}</span>
              )}
              {obs.region && <span>Region: {obs.region}</span>}
              <span>Quelle: {observationSourceLabel(obs.source)}</span>
              {obs.bookingId && <span>Buchung verknüpft</span>}
              {obs.customerId && <span>Kunde verknüpft</span>}
            </div>
          </>
        )}

        {hasActiveLinks(obs) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {obs.convertedToTaskId && onOpenExistingTask && (
              <button
                type="button"
                onClick={() => onOpenExistingTask(obs.convertedToTaskId!)}
                className="text-[10px] font-semibold text-[color:var(--status-info)] hover:underline"
              >
                Aufgabe öffnen
              </button>
            )}
            {obs.linkedDamageId && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Schaden: {obs.linkedDamageId.slice(0, 8)}…
              </span>
            )}
            {obs.linkedServiceCaseId && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Service-Fall: {obs.linkedServiceCaseId.slice(0, 8)}…
              </span>
            )}
            {obs.linkedServiceTaskId && !obs.convertedToTaskId && onOpenExistingTask && (
              <button
                type="button"
                onClick={() => onOpenExistingTask(obs.linkedServiceTaskId!)}
                className="text-[10px] font-semibold text-[color:var(--status-info)] hover:underline"
              >
                Service-Aufgabe öffnen
              </button>
            )}
          </div>
        )}

        {observationClosedAt(obs) && (
          <p className="mt-1 text-[10px] text-[color:var(--status-positive)]">
            Abgeschlossen: {formatDeDateTime(observationClosedAt(obs))}
          </p>
        )}

        {!isHistory && !isEditing && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!obs.convertedToTaskId && ['new', 'active', 'in_review'].includes(obs.status) && (
              <ActionButton
                label="Aufgabe erstellen"
                busy={busy}
                loading={actionKey === `${obs.id}-task`}
                onClick={() =>
                  void runAction(`${obs.id}-task`, async () => {
                    if (!vehicleId || !orgId) return;
                    await api.vehicles.technicalObservations.convertToTask(
                      orgId,
                      vehicleId,
                      obs.id,
                      { description: obs.description },
                    );
                  })
                }
              />
            )}
            {!obs.linkedDamageId && ['new', 'active', 'in_review'].includes(obs.status) && (
              <ActionButton
                label="Als Schaden erfassen"
                busy={busy}
                loading={actionKey === `${obs.id}-damage`}
                onClick={() =>
                  void runAction(`${obs.id}-damage`, async () => {
                    if (!vehicleId || !orgId) return;
                    await api.vehicles.technicalObservations.linkDamage(orgId, vehicleId, obs.id, {
                      createDamage: true,
                      damageDescription: obs.description,
                    });
                  })
                }
              />
            )}
            {!obs.linkedServiceCaseId &&
              !obs.linkedServiceTaskId &&
              ['new', 'active', 'in_review'].includes(obs.status) && (
                <ActionButton
                  label="Service-Aufgabe erstellen"
                  busy={busy}
                  loading={actionKey === `${obs.id}-service`}
                  onClick={() =>
                    void runAction(`${obs.id}-service`, async () => {
                      if (!vehicleId || !orgId) return;
                      await api.vehicles.technicalObservations.linkService(orgId, vehicleId, obs.id, {
                        createServiceCase: true,
                        serviceCaseTitle: obs.title ?? obs.shortLabel ?? undefined,
                      });
                    })
                  }
                />
              )}
            {['new', 'active', 'in_review'].includes(obs.status) && (
              <>
                <ActionButton
                  label="Erledigen"
                  busy={busy}
                  loading={actionKey === `${obs.id}-resolve`}
                  onClick={() =>
                    void runAction(`${obs.id}-resolve`, async () => {
                      if (!vehicleId || !orgId) return;
                      await api.vehicles.technicalObservations.resolve(orgId, vehicleId, obs.id);
                    })
                  }
                />
                <ActionButton
                  label="Verwerfen"
                  variant="muted"
                  busy={busy}
                  loading={actionKey === `${obs.id}-dismiss`}
                  onClick={() =>
                    void runAction(`${obs.id}-dismiss`, async () => {
                      if (!vehicleId || !orgId) return;
                      await api.vehicles.technicalObservations.dismiss(orgId, vehicleId, obs.id);
                    })
                  }
                />
                <ActionButton
                  label="Bearbeiten"
                  variant="muted"
                  busy={busy}
                  onClick={() => {
                    setEditingId(obs.id);
                    setEditDraft({
                      description: obs.description,
                      category: obs.category ?? 'other',
                      affectedArea: obs.affectedArea ?? '',
                      severity: obs.severity,
                      blocksRental: obs.blocksRental,
                    });
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div onClick={openModal} className={`${quickCardClass} order-2`}>
        <div
          className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${
            loadError ? 'bg-muted' : activeCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/8'
          }`}
        />
        <div className={quickCardHeaderClass}>
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${quickAccent}`}>
              <Icon name="clipboard-list" className="w-3.5 h-3.5" />
            </div>
            <h3 className={`${quickCardTitleClass} truncate`}>Technische Beobachtungen</h3>
          </div>
          <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 shrink-0" />
        </div>
        <div className={`${quickCardBodyClass} items-center`}>
          {loading ? (
            <SkeletonCard className="w-full" />
          ) : loadError ? (
            <>
              <div className="text-[11px] font-semibold text-muted-foreground">Nicht geladen</div>
              <p className="text-[10px] mt-1 text-muted-foreground/80 text-center">
                Beobachtungen konnten nicht geladen werden
              </p>
            </>
          ) : (
            <>
              <div
                className={`text-[40px] font-black tracking-tighter leading-none ${
                  activeCount > 0 ? 'text-amber-500 drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]' : 'text-foreground'
                }`}
              >
                {activeCount}
              </div>
              <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${moduleSummary.chipClass}`}>
                {activeCount === 0 && complaintsModule?.state === 'good' ? (
                  <><Icon name="check-circle" className="w-2.5 h-2.5" /> {moduleSummary.label}</>
                ) : hasRentalBlock ? (
                  <><Icon name="alert-triangle" className="w-2.5 h-2.5" /> Vermietung blockiert</>
                ) : activeCount > 0 ? (
                  <><Icon name="alert-circle" className="w-2.5 h-2.5" /> {moduleSummary.label}</>
                ) : (
                  <><Icon name="check-circle" className="w-2.5 h-2.5" /> {moduleSummary.label}</>
                )}
              </div>
            </>
          )}
        </div>
        <div className={`${quickCardFooterClass} flex items-center gap-1.5`}>
          <Icon name="clipboard-list" className="w-3 h-3 text-muted-foreground/70 shrink-0" />
          <p className="text-[10px] font-medium text-muted-foreground line-clamp-2">
            Hinweise aus Rückgabe, Übergabe und Fahrzeugkontrolle
          </p>
        </div>
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={closeModal}
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out"
              style={{ opacity: animating && !closing ? 1 : 0 }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-xl p-4 sm:p-5 shadow-lg bg-card border border-border pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] transition-all duration-500 ease-out"
              style={{
                transform: animating && !closing ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(12px)',
                opacity: animating && !closing ? 1 : 0,
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted z-10"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>

              <div className="mb-4 pr-10">
                <h2 className="text-base font-semibold text-foreground">Technische Beobachtungen</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Hinweise aus Rückgabe, Übergabe und Fahrzeugkontrolle, die keinem festen Health-Modul zugeordnet sind.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${moduleSummary.chipClass}`}>
                    {moduleSummary.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {activeCount} aktiv · {history.length} im Verlauf
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/80 mt-1">{moduleSummary.hint}</p>
              </div>

              <div className="rounded-lg p-4 mb-5 bg-muted">
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground">
                  Neue Beobachtung
                </p>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Beobachtung beschreiben, z. B. Scheibenwischer verschlissen, Licht defekt, Knopf kaputt …"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-sm border outline-none mb-2 bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground mb-1 block">Kategorie *</span>
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          category: e.target.value as TechnicalObservationCategory,
                        }))
                      }
                      className="w-full rounded-xl px-3 py-2 text-xs border outline-none bg-background border-border text-foreground"
                    >
                      {OBSERVATION_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-muted-foreground mb-1 block">Schweregrad *</span>
                    <select
                      value={form.severity}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          severity: e.target.value as TechnicalObservationSeverity,
                        }))
                      }
                      className="w-full rounded-xl px-3 py-2 text-xs border outline-none bg-background border-border text-foreground"
                    >
                      {OBSERVATION_SEVERITIES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[10px] font-semibold text-muted-foreground mb-1 block">Betroffener Bereich</span>
                    <select
                      value={form.affectedArea}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          affectedArea: e.target.value as TechnicalObservationAffectedArea | '',
                        }))
                      }
                      className="w-full rounded-xl px-3 py-2 text-xs border outline-none bg-background border-border text-foreground"
                    >
                      <option value="">— optional —</option>
                      {OBSERVATION_AREAS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex items-start gap-2 mb-3 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.blocksRental}
                    onChange={(e) => setForm((f) => ({ ...f, blocksRental: e.target.checked }))}
                  />
                  <span>
                    Vermietung blockieren — nur aktivieren, wenn das Fahrzeug aus Sicherheitsgründen nicht vermietet werden darf.
                  </span>
                </label>
                {formError && <p className="text-[11px] text-[color:var(--status-critical)] mb-2">{formError}</p>}
                {formSuccess && (
                  <p className="text-[11px] text-[color:var(--status-positive)] mb-2">Beobachtung gespeichert.</p>
                )}
                <button
                  type="button"
                  disabled={submitting || !form.description.trim() || !orgId || !vehicleId}
                  onClick={() => void submitObservation()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold sq-tone-brand text-white hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Icon name="loader-2" className="w-4 h-4 animate-spin inline" />
                  ) : (
                    'Beobachtung speichern'
                  )}
                </button>
              </div>

              {actionError && (
                <p className="text-[11px] text-[color:var(--status-critical)] mb-3">{actionError}</p>
              )}

              <h3 className="text-sm font-semibold mb-3 text-foreground">Aktiv</h3>
              <div className="space-y-2 mb-5">
                {loadError ? (
                  <p className="text-[11px] text-muted-foreground">Beobachtungen konnten nicht geladen werden.</p>
                ) : active.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine aktiven Beobachtungen</p>
                ) : (
                  active.map((obs) => renderObservationCard(obs, false))
                )}
              </div>

              <h3 className="text-sm font-semibold mb-3 text-foreground">Verlauf</h3>
              <div className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine abgeschlossenen Einträge</p>
                ) : (
                  history.map((obs) => renderObservationCard(obs, true))
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  loading,
  variant = 'primary',
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'muted';
}) {
  const base =
    variant === 'primary'
      ? 'bg-background border border-border text-foreground hover:bg-muted'
      : 'bg-transparent border border-transparent text-muted-foreground hover:bg-background hover:border-border';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-50 ${base}`}
    >
      {loading ? <Icon name="loader-2" className="w-3 h-3 animate-spin inline" /> : label}
    </button>
  );
}
