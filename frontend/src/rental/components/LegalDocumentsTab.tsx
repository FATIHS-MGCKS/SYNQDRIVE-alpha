import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { api, type LegalDocumentDto } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

const LEGAL_TYPES: { key: string; title: string; hint: string }[] = [
  {
    key: 'TERMS_AND_CONDITIONS',
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    hint: 'Wird der Buchung beigefügt und im Mietvertrag referenziert.',
  },
  {
    key: 'WITHDRAWAL_INFORMATION',
    title: 'Widerrufsbelehrung',
    hint: 'Pflichtinformation zum Widerrufsrecht, wird der Buchung beigefügt.',
  },
];

interface LegalDocumentsTabProps {
  isDarkMode: boolean;
}

interface UploadState {
  versionLabel: string;
  title: string;
  busy: boolean;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function LegalDocumentsTab({ isDarkMode }: LegalDocumentsTabProps) {
  const { orgId, userRole } = useRentalOrg();
  const isOrgAdmin = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';

  const [docs, setDocs] = useState<LegalDocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({
    TERMS_AND_CONDITIONS: { versionLabel: '', title: '', busy: false },
    WITHDRAWAL_INFORMATION: { versionLabel: '', title: '', busy: false },
  });
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const list = await api.legalDocuments.list(orgId);
      setDocs(Array.isArray(list) ? list : []);
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Laden fehlgeschlagen' });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byType = useMemo(() => {
    const map: Record<string, LegalDocumentDto[]> = {};
    for (const t of LEGAL_TYPES) map[t.key] = [];
    for (const d of docs) {
      if (!map[d.documentType]) map[d.documentType] = [];
      map[d.documentType].push(d);
    }
    return map;
  }, [docs]);

  const missingActive = useMemo(
    () => LEGAL_TYPES.filter((t) => !(byType[t.key] || []).some((d) => d.status === 'ACTIVE')),
    [byType],
  );

  const setUpload = (type: string, patch: Partial<UploadState>) =>
    setUploads((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleUpload = useCallback(
    async (type: string, file: File) => {
      if (!orgId) return;
      const state = uploads[type];
      if (!state?.versionLabel.trim()) {
        setBanner({ kind: 'error', text: 'Bitte zuerst eine Versionsbezeichnung eingeben.' });
        return;
      }
      if (file.type !== 'application/pdf') {
        setBanner({ kind: 'error', text: 'Nur PDF-Dateien sind erlaubt.' });
        return;
      }
      setUpload(type, { busy: true });
      setBanner(null);
      try {
        await api.legalDocuments.upload(orgId, {
          documentType: type,
          versionLabel: state.versionLabel.trim(),
          title: state.title.trim() || undefined,
          file,
        });
        setUpload(type, { busy: false, versionLabel: '', title: '' });
        setBanner({ kind: 'success', text: 'Dokument hochgeladen. Aktivieren Sie die Version, um sie zu verwenden.' });
        await load();
      } catch (err) {
        setUpload(type, { busy: false });
        setBanner({ kind: 'error', text: (err as Error).message || 'Upload fehlgeschlagen' });
      }
    },
    [orgId, uploads, load],
  );

  const handleActivate = useCallback(
    async (id: string) => {
      if (!orgId) return;
      try {
        await api.legalDocuments.activate(orgId, id);
        setBanner({ kind: 'success', text: 'Version aktiviert.' });
        await load();
      } catch (err) {
        setBanner({ kind: 'error', text: (err as Error).message || 'Aktivierung fehlgeschlagen' });
      }
    },
    [orgId, load],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      if (!orgId) return;
      try {
        await api.legalDocuments.archive(orgId, id);
        await load();
      } catch (err) {
        setBanner({ kind: 'error', text: (err as Error).message || 'Archivierung fehlgeschlagen' });
      }
    },
    [orgId, load],
  );

  const cardClass = `rounded-2xl border p-4 ${
    isDarkMode ? 'bg-card border-border' : 'bg-white border-gray-200'
  }`;
  const subtle = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: isDarkMode
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      DRAFT: isDarkMode
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-amber-50 text-amber-700 border-amber-200',
      ARCHIVED: isDarkMode
        ? 'bg-neutral-700/40 text-neutral-400 border-neutral-600'
        : 'bg-gray-100 text-gray-500 border-gray-200',
    };
    const label: Record<string, string> = { ACTIVE: 'Aktiv', DRAFT: 'Entwurf', ARCHIVED: 'Archiviert' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[status] ?? map.DRAFT}`}>
        {label[status] ?? status}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Rechtliche Dokumente
        </h2>
        <p className={`text-sm mt-0.5 ${subtle}`}>
          Laden Sie Ihre AGB und Widerrufsbelehrung hoch und verwalten Sie Versionen. Die aktive
          Version wird automatisch an Buchungsdokumente angehängt. SynqDrive generiert diese
          Rechtstexte nicht — sie werden von Ihrem Unternehmen verwaltet.
        </p>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            banner.kind === 'error'
              ? isDarkMode
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-red-50 border-red-200 text-red-700'
              : isDarkMode
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {banner.kind === 'error' ? (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {missingActive.length > 0 && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            isDarkMode
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Es fehlt eine aktive Version für: {missingActive.map((m) => m.title).join(', ')}. Buchungs­dokumentenpakete
            bleiben dadurch unvollständig.
          </span>
        </div>
      )}

      {loading ? (
        <div className={`flex items-center gap-2 ${subtle}`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Lädt…
        </div>
      ) : (
        LEGAL_TYPES.map((type) => {
          const versions = byType[type.key] || [];
          const active = versions.find((v) => v.status === 'ACTIVE');
          const up = uploads[type.key];
          return (
            <div key={type.key} className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-muted' : 'bg-gray-100'}`}>
                    <FileText className={`w-4.5 h-4.5 ${isDarkMode ? 'text-foreground/85' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <div className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{type.title}</div>
                    <div className={`text-xs ${subtle}`}>{type.hint}</div>
                  </div>
                </div>
                {active ? (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    <ShieldCheck className="w-4 h-4" /> Aktiv: v{active.versionLabel}
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                    <AlertTriangle className="w-4 h-4" /> Keine aktive Version
                  </span>
                )}
              </div>

              {/* Upload (admin only) */}
              {isOrgAdmin && (
                <div className={`mt-3 rounded-xl border border-dashed p-3 ${isDarkMode ? 'border-border' : 'border-gray-300'}`}>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      type="text"
                      value={up?.versionLabel ?? ''}
                      onChange={(e) => setUpload(type.key, { versionLabel: e.target.value })}
                      placeholder="Version (z. B. 2026-01)"
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${
                        isDarkMode ? 'bg-muted border-border text-foreground placeholder:text-muted-foreground' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                    <input
                      type="text"
                      value={up?.title ?? ''}
                      onChange={(e) => setUpload(type.key, { title: e.target.value })}
                      placeholder="Titel (optional)"
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${
                        isDarkMode ? 'bg-muted border-border text-foreground placeholder:text-muted-foreground' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                    <input
                      ref={(el) => {
                        fileRefs.current[type.key] = el;
                      }}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(type.key, f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={up?.busy}
                      onClick={() => fileRefs.current[type.key]?.click()}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                        isDarkMode ? 'bg-white text-neutral-900 hover:bg-gray-100' : 'bg-neutral-900 text-white hover:bg-card'
                      } disabled:opacity-50`}
                    >
                      {up?.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      PDF hochladen
                    </button>
                  </div>
                </div>
              )}

              {/* Version history */}
              <div className="mt-3 space-y-1.5">
                {versions.length === 0 ? (
                  <div className={`text-xs py-3 text-center rounded-lg border border-dashed ${isDarkMode ? 'border-border text-muted-foreground' : 'border-border text-muted-foreground'}`}>
                    Noch keine Version hochgeladen.
                  </div>
                ) : (
                  versions.map((v) => (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${
                        isDarkMode ? 'border-border bg-muted/40' : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            v{v.versionLabel}
                          </span>
                          {statusBadge(v.status)}
                        </div>
                        <div className={`text-[11px] ${subtle} truncate`}>
                          {v.fileName} · {formatBytes(v.sizeBytes)} · {formatDate(v.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Herunterladen"
                          onClick={() => void api.legalDocuments.open(orgId, v.id)}
                          className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-muted/80 text-foreground/85' : 'hover:bg-gray-200 text-gray-600'}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {isOrgAdmin && v.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => void handleActivate(v.id)}
                            className={`text-xs font-medium px-2 py-1 rounded-lg ${
                              isDarkMode ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            Aktivieren
                          </button>
                        )}
                        {isOrgAdmin && v.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => void handleArchive(v.id)}
                            className={`text-xs font-medium px-2 py-1 rounded-lg ${isDarkMode ? 'text-muted-foreground hover:bg-muted/80' : 'text-gray-500 hover:bg-gray-200'}`}
                          >
                            Archivieren
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })
      )}

      {!isOrgAdmin && (
        <p className={`text-xs ${subtle}`}>
          Nur Administratoren können rechtliche Dokumente hochladen oder aktivieren.
        </p>
      )}
    </div>
  );
}
