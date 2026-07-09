import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../../components/ui/accordion';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import {
  DataCard,
  ErrorState,
  PageHeader,
  SectionHeader,
  SkeletonRows,
  StatusChip,
} from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import type { EmailDnsRecordDto, OrgEmailDomainDto } from '../../../../lib/api';
import { useRentalOrg } from '../../../RentalContext';
import {
  DNS_PROVIDER_HINTS,
  DNS_PURPOSE_LABELS,
  DOMAIN_STATUS_LABELS,
} from './email-delivery.constants';
import {
  buildEmailPreview,
  canSelectVerifiedMode,
  effectiveDomainStatus,
  pickPrimaryDomain,
  resolveDeliveryModeLabel,
} from './email-delivery.utils';
import { useEmailDeliveryCenter } from './useEmailDeliveryCenter';

const inputClass =
  'w-full text-sm border-border/70 bg-background focus:border-[color:var(--brand)] focus:ring-[color:var(--brand-soft)]';
const labelClass =
  'block text-[11px] font-semibold mb-1.5 uppercase tracking-wider text-muted-foreground';

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error('Kopieren fehlgeschlagen');
  }
}

function domainStatusTone(
  status: OrgEmailDomainDto['status'],
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  if (status === 'VERIFIED') return 'success';
  if (status === 'FAILED') return 'critical';
  if (status === 'VERIFYING') return 'info';
  if (status === 'PENDING_DNS') return 'warning';
  return 'neutral';
}

function DnsRecordCard({
  record,
  disabled,
}: {
  record: EmailDnsRecordDto;
  disabled?: boolean;
}) {
  const verified = record.status === 'verified';
  return (
    <div className="rounded-xl border border-border/60 surface-premium p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-foreground">
            {DNS_PURPOSE_LABELS[record.purpose] ?? record.purpose}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
            {record.type}
          </span>
        </div>
        <StatusChip tone={verified ? 'success' : 'warning'}>
          {verified ? 'Verifiziert' : 'Ausstehend'}
        </StatusChip>
      </div>
      <div className="space-y-2">
        <DnsField
          label="Host / Name"
          value={record.host}
          disabled={disabled}
        />
        <DnsField label="Wert" value={record.value} disabled={disabled} multiline />
      </div>
    </div>
  );
}

function DnsField({
  label,
  value,
  disabled,
  multiline,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 px-2 text-[11px] gap-1"
          onClick={() => void copyText(value, label)}
        >
          <Copy className="w-3 h-3" />
          Kopieren
        </Button>
      </div>
      {multiline ? (
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 text-foreground">
          {value}
        </pre>
      ) : (
        <div className="text-[11px] font-mono break-all rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 text-foreground">
          {value}
        </div>
      )}
    </div>
  );
}

interface ModeCardProps {
  selected: boolean;
  title: string;
  description: string;
  recommended?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onSetup?: () => void;
  showSetupCta?: boolean;
}

function ModeCard({
  selected,
  title,
  description,
  recommended,
  disabled,
  onSelect,
  onSetup,
  showSetupCta,
}: ModeCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        selected
          ? 'border-[color:var(--brand)]/50 bg-[color:var(--brand-soft)]/40 shadow-sm'
          : 'border-border/60 surface-premium',
        disabled && !showSetupCta && 'opacity-70',
      )}
    >
      <button
        type="button"
        disabled={disabled && !showSetupCta}
        onClick={onSelect}
        className="w-full text-left disabled:cursor-not-allowed"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
              selected ? 'border-[color:var(--brand)]' : 'border-border',
            )}
          >
            {selected ? (
              <span className="w-2 h-2 rounded-full bg-[color:var(--brand)]" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              {recommended ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full sq-tone-brand">
                  Empfohlen
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
      </button>
      {showSetupCta && onSetup ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full sm:w-auto"
          onClick={onSetup}
        >
          Domain einrichten
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      ) : null}
    </div>
  );
}

export function EmailDeliveryTab() {
  const { orgId, orgName, userRole } = useRentalOrg();
  const canWrite = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';

  const {
    settings,
    domains,
    loading,
    error,
    savingSettings,
    creatingDomain,
    checkingDomainId,
    activatingMode,
    sendingTest,
    load,
    saveSettings,
    setMode,
    createDomain,
    checkDomain,
    activateVerifiedDomain,
    sendTestEmail,
  } = useEmailDeliveryCenter(orgId);

  const domainSectionRef = useRef<HTMLDivElement>(null);

  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [signature, setSignature] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [domainFromEmail, setDomainFromEmail] = useState('');
  const [domainFromName, setDomainFromName] = useState('');
  const [domainReplyTo, setDomainReplyTo] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    setFromName(settings.defaultFromName ?? '');
    setReplyTo(settings.defaultReplyToEmail ?? '');
    setSignature(settings.signatureText ?? '');
  }, [settings]);

  const primaryDomain = useMemo(() => {
    if (selectedDomainId) {
      return domains.find((d) => d.id === selectedDomainId) ?? pickPrimaryDomain(domains);
    }
    return pickPrimaryDomain(domains);
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (primaryDomain && !selectedDomainId) {
      setSelectedDomainId(primaryDomain.id);
    }
  }, [primaryDomain, selectedDomainId]);

  const preview = useMemo(
    () =>
      buildEmailPreview({
        orgName,
        settings,
        primaryDomain,
      }),
    [orgName, settings, primaryDomain],
  );

  const modeLabel = useMemo(
    () => resolveDeliveryModeLabel({ settings, domains }),
    [settings, domains],
  );

  const domainStatus = effectiveDomainStatus(domains, primaryDomain);
  const verifiedAvailable = canSelectVerifiedMode(domains);
  const currentMode = settings?.mode ?? 'SYNQDRIVE_DEFAULT';

  const scrollToDomainSetup = useCallback(() => {
    domainSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSaveDefaults = useCallback(async () => {
    await saveSettings({
      defaultFromName: fromName.trim() || null,
      defaultReplyToEmail: replyTo.trim() || null,
      signatureText: signature.trim() || null,
      signatureHtml: null,
    });
  }, [fromName, replyTo, signature, saveSettings]);

  const handleModeChange = useCallback(
    async (mode: 'SYNQDRIVE_DEFAULT' | 'VERIFIED_DOMAIN') => {
      if (mode === 'VERIFIED_DOMAIN' && !verifiedAvailable) {
        scrollToDomainSetup();
        return;
      }
      await setMode(mode);
    },
    [verifiedAvailable, scrollToDomainSetup, setMode],
  );

  const handleCreateDomain = useCallback(async () => {
    const domain = domainInput.trim();
    const fromEmail = domainFromEmail.trim();
    if (!domain || !fromEmail) {
      toast.error('Bitte Domain und Absenderadresse ausfüllen.');
      return;
    }
    const created = await createDomain({
      domain,
      fromEmail,
      fromName: domainFromName.trim() || undefined,
      replyToEmail: domainReplyTo.trim() || undefined,
    });
    if (created) {
      setSelectedDomainId(created.id);
      setDomainInput('');
      setDomainFromEmail('');
      setDomainFromName('');
      setDomainReplyTo('');
    }
  }, [
    domainInput,
    domainFromEmail,
    domainFromName,
    domainReplyTo,
    createDomain,
  ]);

  const statusHeadline =
    modeLabel === 'verified_domain'
      ? 'Eigene Domain verifiziert'
      : modeLabel === 'setup_pending'
        ? 'Einrichtung ausstehend'
        : 'SynqDrive Standard-Absender';

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="E-Mail & Versand"
          description="Konfigurieren Sie, wie SynqDrive Dokumente, Rechnungen und Protokolle an Kunden sendet."
          variant="full"
        />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="E-Mail & Versand"
          description="Konfigurieren Sie, wie SynqDrive Dokumente, Rechnungen und Protokolle an Kunden sendet."
          variant="full"
        />
        <ErrorState error={error} onRetry={() => void load()} retryLabel="Erneut laden" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-Mail & Versand"
        description="Konfigurieren Sie, wie SynqDrive Dokumente, Rechnungen und Protokolle an Kunden sendet."
        variant="full"
      />

      {!canWrite ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Nur Administratoren können den Versand konfigurieren. Sie sehen den aktuellen Status.</span>
        </div>
      ) : null}

      <DataCard className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg sq-tone-brand">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Aktueller Versandmodus
                </p>
                <p className="text-sm font-semibold text-foreground">{statusHeadline}</p>
              </div>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Von
                </span>
                <p className="font-mono text-xs mt-0.5 break-all text-foreground">{preview.fromLine}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Antwort an
                </span>
                <p className="font-mono text-xs mt-0.5 break-all text-foreground">{preview.replyTo}</p>
              </div>
            </div>
          </div>
          {primaryDomain ? (
            <StatusChip tone={domainStatusTone(domainStatus)}>
              {DOMAIN_STATUS_LABELS[domainStatus]}
            </StatusChip>
          ) : null}
        </div>
      </DataCard>

      <section className="space-y-3">
        <SectionHeader title="Versandmodus" />
        <div className="grid gap-3 md:grid-cols-2">
          <ModeCard
            selected={currentMode === 'SYNQDRIVE_DEFAULT'}
            title="SynqDrive Standard-Absender"
            description="Schneller Start ohne DNS-Einrichtung. E-Mails werden über die SynqDrive-Infrastruktur mit Ihrem Firmennamen versendet."
            recommended
            disabled={!canWrite}
            onSelect={() => void handleModeChange('SYNQDRIVE_DEFAULT')}
          />
          <ModeCard
            selected={currentMode === 'VERIFIED_DOMAIN'}
            title="Eigene Domain verbinden"
            description="Professioneller White-Label-Versand von Ihrer eigenen Domain — nach erfolgreicher DNS-Verifizierung."
            disabled={!canWrite || (!verifiedAvailable && currentMode !== 'VERIFIED_DOMAIN')}
            showSetupCta={canWrite && !verifiedAvailable}
            onSelect={() => void handleModeChange('VERIFIED_DOMAIN')}
            onSetup={scrollToDomainSetup}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Standard-Absender"
          description="Gilt für den SynqDrive-Standardversand und als Fallback, solange keine eigene Domain aktiv ist."
        />
        <DataCard className="p-4 sm:p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="email-from-name">
                Absendername
              </label>
              <Input
                id="email-from-name"
                className={inputClass}
                placeholder={orgName || 'Ihr Firmenname'}
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                disabled={!canWrite}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="email-reply-to">
                Antwortadresse / Reply-To
              </label>
              <Input
                id="email-reply-to"
                type="email"
                className={inputClass}
                placeholder="info@ihrefirma.de"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                disabled={!canWrite}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="email-signature">
              Firmen-Signatur
            </label>
            <Textarea
              id="email-signature"
              rows={4}
              className={cn(inputClass, 'resize-y min-h-[96px]')}
              placeholder="Mit freundlichen Grüßen&#10;Ihr Team"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              disabled={!canWrite}
            />
          </div>
          {canWrite ? (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSaveDefaults()}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Speichern
              </Button>
            </div>
          ) : null}
        </DataCard>
      </section>

      <section ref={domainSectionRef} className="space-y-3 scroll-mt-6">
        <SectionHeader
          title="Eigene Domain verbinden"
          description="Tragen Sie Ihre Domain ein und hinterlegen Sie anschließend die DNS-Einträge bei Ihrem Hosting-Anbieter."
        />
        <DataCard className="p-4 sm:p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="email-domain">
                Domain
              </label>
              <Input
                id="email-domain"
                className={inputClass}
                placeholder="ihrefirma.de"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                disabled={!canWrite || creatingDomain}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="email-domain-from">
                Absenderadresse
              </label>
              <Input
                id="email-domain-from"
                type="email"
                className={inputClass}
                placeholder="noreply@ihrefirma.de"
                value={domainFromEmail}
                onChange={(e) => setDomainFromEmail(e.target.value)}
                disabled={!canWrite || creatingDomain}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="email-domain-from-name">
                Absendername
              </label>
              <Input
                id="email-domain-from-name"
                className={inputClass}
                placeholder={orgName || 'Ihr Firmenname'}
                value={domainFromName}
                onChange={(e) => setDomainFromName(e.target.value)}
                disabled={!canWrite || creatingDomain}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="email-domain-reply">
                Antwortadresse
              </label>
              <Input
                id="email-domain-reply"
                type="email"
                className={inputClass}
                placeholder="info@ihrefirma.de"
                value={domainReplyTo}
                onChange={(e) => setDomainReplyTo(e.target.value)}
                disabled={!canWrite || creatingDomain}
              />
            </div>
          </div>
          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreateDomain()}
              disabled={creatingDomain}
            >
              {creatingDomain ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Globe className="w-4 h-4 mr-2" />
              )}
              Domain hinzufügen
            </Button>
          ) : null}
        </DataCard>
      </section>

      {domains.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="DNS-Einträge & Domain-Status" />
          {domains.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {domains.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDomainId(d.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                    selectedDomainId === d.id
                      ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-foreground'
                      : 'border-border/60 surface-premium text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d.domain}
                </button>
              ))}
            </div>
          ) : null}

          {primaryDomain ? (
            <DataCard className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{primaryDomain.domain}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {primaryDomain.fromEmail}
                    {primaryDomain.verifiedAt
                      ? ` · verifiziert am ${new Date(primaryDomain.verifiedAt).toLocaleDateString('de-DE')}`
                      : null}
                  </p>
                </div>
                <StatusChip tone={domainStatusTone(primaryDomain.status)}>
                  {DOMAIN_STATUS_LABELS[primaryDomain.status]}
                </StatusChip>
              </div>

              {primaryDomain.failureReason ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {primaryDomain.failureReason}
                </div>
              ) : null}

              <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                Diese Werte müssen in Ihrem Domain-/Hosting-Dashboard eingetragen werden. Die
                Prüfung kann je nach DNS-Anbieter einige Minuten dauern.
              </div>

              <div className="grid gap-3">
                {(primaryDomain.dnsRecords ?? []).map((record, idx) => (
                  <DnsRecordCard
                    key={`${record.purpose}-${idx}`}
                    record={record}
                    disabled={!canWrite}
                  />
                ))}
              </div>

              {canWrite ? (
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void checkDomain(primaryDomain.id)}
                    disabled={checkingDomainId === primaryDomain.id}
                  >
                    {checkingDomainId === primaryDomain.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Verifizierung prüfen
                  </Button>

                  {primaryDomain.status === 'VERIFIED' && currentMode !== 'VERIFIED_DOMAIN' ? (
                    <Button
                      type="button"
                      onClick={() => void activateVerifiedDomain()}
                      disabled={activatingMode}
                    >
                      {activatingMode ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 mr-2" />
                      )}
                      Als Versanddomain aktivieren
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </DataCard>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader title="Test-E-Mail" description="Prüfen Sie, ob Empfänger Ihre E-Mails korrekt erhalten." />
        <DataCard className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              className={cn(inputClass, 'flex-1')}
              placeholder="test@beispiel.de"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              disabled={!canWrite || sendingTest}
            />
            {canWrite ? (
              <Button
                type="button"
                onClick={() => void sendTestEmail(testEmailTo)}
                disabled={sendingTest || !testEmailTo.trim()}
              >
                {sendingTest ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Test-E-Mail senden
              </Button>
            ) : null}
          </div>
        </DataCard>
      </section>

      <section className="space-y-2">
        <SectionHeader title="DNS-Hilfe für gängige Anbieter" />
        <Accordion type="single" collapsible className="rounded-xl border border-border/60 surface-premium px-4">
          {DNS_PROVIDER_HINTS.map((hint) => (
            <AccordionItem key={hint.id} value={hint.id}>
              <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">
                {hint.title}
              </AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground pb-3 leading-relaxed">
                {hint.hint}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
