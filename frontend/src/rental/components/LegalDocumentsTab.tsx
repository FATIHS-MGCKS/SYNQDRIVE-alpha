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
import { Button } from '../../components/ui/button';
import { useRentalOrg } from '../RentalContext';
import { isLegalPdfFile } from '../lib/legal-documents.utils';
import {
  CONSUMER_INFORMATION_VARIANT,
  LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE,
  LEGAL_DOCUMENT_TYPE,
  LEGAL_DOCUMENT_TYPE_CONFIGS,
  legalDocumentGroupKey,
  type ConsumerInformationVariant,
} from '../lib/legal-document-types';

interface LegalDocumentsTabProps {
  isDarkMode: boolean;
}

interface UploadState {
  versionLabel: string;
  title: string;
  legalVariant?: ConsumerInformationVariant;
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
  const { orgId, hasPermission } = useRentalOrg();
  const canViewLegal = hasPermission('legal-documents', 'read');
  const canUploadLegal = hasPermission('legal-documents', 'write');
  const canPublishLegal = hasPermission('legal-documents', 'manage');
  const canMutateLegal = canUploadLegal || canPublishLegal;

  const [docs, setDocs] = useState<LegalDocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({
    TERMS_AND_CONDITIONS: { versionLabel: '', title: '', busy: false },
    CONSUMER_INFORMATION: {
      versionLabel: '',
      title: '',
      legalVariant: CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
      busy: false,
    },
    PRIVACY_POLICY: { versionLabel: '', title: '', busy: false },
  });
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const [pendingUploadType, setPendingUploadType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    for (const t of LEGAL_DOCUMENT_TYPE_CONFIGS) map[t.key] = [];
    for (const d of docs) {
      const key = legalDocumentGroupKey(d.documentType, d.legacyDocumentType);
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [docs]);

  const missingActive = useMemo(
    () => LEGAL_DOCUMENT_TYPE_CONFIGS.filter((t) => !(byType[t.key] || []).some((d) => d.status === 'ACTIVE')),
    [byType],
  );

  const setUpload = (type: string, patch: Partial<UploadState>) =>
    setUploads((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleUpload = useCallback(
    async (type: string, file: File) => {
      if (!orgId) return;
      const state = uploadsRef.current[type];
      if (!state?.versionLabel.trim()) {
        setBanner({ kind: 'error', text: 'Bitte zuerst eine Versionsbezeichnung eingeben.' });
        return;
      }
      if (!isLegalPdfFile(file)) {
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
          legalVariant:
            type === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ? state.legalVariant : undefined,
          file,
        });
        setUpload(type, { busy: false, versionLabel: '', title: '' });
        setBanner({ kind: 'success', text: 'Dokument hochgeladen. Aktivieren Sie die Version, um sie zu verwenden.' });
        await load();
      } catch (err) {
        setUpload(type, { busy: false });
        const message = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
        setBanner({ kind: 'error', text: message });
      }
    },
    [orgId, load],
  );

  const openFilePicker = useCallback((type: string) => {
    const state = uploadsRef.current[type];
    if (!state?.versionLabel.trim()) {
      setBanner({ kind: 'error', text: 'Bitte zuerst eine Versionsbezeichnung eingeben.' });
      return;
    }
    setBanner(null);
    setPendingUploadType(type);
    fileInputRef.current?.click();
  }, []);

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
    isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'
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
          Laden Sie AGB, Verbraucherinformation und Datenschutzerklärung hoch und verwalten Sie Versionen.
          Die aktive Version wird automatisch an Buchungsdokumente angehängt. SynqDrive generiert keine
          rechtsverbindlichen Standardtexte — Inhalte werden von Ihrem Unternehmen verwaltet.
        </p>
        <p className={`text-xs mt-2 ${subtle}`}>{LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE}</p>
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

      {canUploadLegal && (
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const type = pendingUploadType;
            const f = e.target.files?.[0];
            e.target.value = '';
            setPendingUploadType(null);
            if (type && f) void handleUpload(type, f);
          }}
        />
      )}

      {loading ? (
        <div className={`flex items-center gap-2 ${subtle}`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Lädt…
        </div>
      ) : (
        LEGAL_DOCUMENT_TYPE_CONFIGS.map((type) => {
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
              {canUploadLegal && (
                <div className={`mt-3 rounded-xl border border-dashed p-3 ${isDarkMode ? 'border-border' : 'border-gray-300'}`}>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    {type.key === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION && type.variants && (
                      <select
                        value={up?.legalVariant ?? CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE}
                        onChange={(e) =>
                          setUpload(type.key, {
                            legalVariant: e.target.value as ConsumerInformationVariant,
                          })
                        }
                        className={`rounded-lg border px-3 py-1.5 text-sm ${
                          isDarkMode
                            ? 'bg-muted border-border text-foreground'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        {type.variants.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    )}
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
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={up?.busy}
                      onClick={() => openFilePicker(type.key)}
                    >
                      {up?.busy ? <Loader2 className="animate-spin" /> : <Upload />}
                      PDF hochladen
                    </Button>
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
                          {v.legalVariant ? ` · ${v.legalVariant}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Herunterladen"
                          onClick={() => void api.legalDocuments.open(orgId, v.id)}
                        >
                          <Download />
                        </Button>
                        {canPublishLegal && v.status !== 'ACTIVE' && (
                          <Button
                            type="button"
                            variant="success"
                            size="sm"
                            onClick={() => void handleActivate(v.id)}
                          >
                            Aktivieren
                          </Button>
                        )}
                        {canUploadLegal && v.status === 'DRAFT' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleArchive(v.id)}
                          >
                            Archivieren
                          </Button>
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

      {!canMutateLegal && (
        <p className={`text-xs ${subtle}`}>
          Nur Administratoren können rechtliche Dokumente hochladen oder aktivieren.
        </p>
      )}
    </div>
  );
}
