import { Icon } from './ui/Icon';
import { VehicleData } from '../data/vehicles';
import {
  PageHeader,
  MetricCard,
  DataCard,
  StatusChip,
  EmptyState,
} from '../../components/patterns';

interface DocumentsViewProps {
  vehicle?: VehicleData | null;
}

type TuvRow = { date: string; org: string; km: string; result: string; next: string };
type ServiceRow = { date: string; art: string; workshop: string; km: string; cost: string };
type RepairRow = { date: string; repair: string; workshop: string; km: string; cost: string };

const tuvHistory: TuvRow[] = [];
const serviceHistory: ServiceRow[] = [];
const repairHistory: RepairRow[] = [];

export function DocumentsView({ vehicle }: DocumentsViewProps) {
  const dash = '—';
  const vehicleName = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') : 'Kein Fahrzeug ausgewählt';
  const vehicleSubtitle = vehicle ? [vehicle.license, vehicle.station].filter(Boolean).join(' · ') : 'Wähle ein Fahrzeug aus, um Dokumente und Fixkosten zu prüfen.';
  const monthlyLines = [
    { label: 'Leasing/Finanzierung', value: vehicle?.leasingRate ?? dash, tone: 'info' as const },
    { label: 'Versicherung', value: vehicle?.insuranceCost ?? dash, tone: 'success' as const },
    { label: 'Kfz-Steuer', value: vehicle?.taxCost ?? dash, tone: 'warning' as const },
    { label: 'Wartung & Service (Ø)', value: dash, tone: 'neutral' as const },
    { label: 'Reparaturen (Ø)', value: dash, tone: 'neutral' as const },
  ];
  const configuredCostLines = monthlyLines.filter((line) => line.value !== dash && line.value !== '').length;

  const documentCards = [
    {
      title: 'Leasing/Finanzierung',
      description: 'Vertrag, Laufzeit, Rate und Restwert',
      icon: 'receipt',
      tone: 'info' as const,
      action: 'Vertrag hinzufügen',
    },
    {
      title: 'Versicherung',
      description: 'Police, Deckung und Selbstbeteiligung',
      icon: 'shield',
      tone: 'success' as const,
      action: 'Police hinzufügen',
    },
    {
      title: 'Kfz-Steuer',
      description: 'Bescheid und jährliche Steuerlast',
      icon: 'dollar-sign',
      tone: 'warning' as const,
      action: 'Bescheid hinzufügen',
    },
    {
      title: 'Zulassung',
      description: 'Fahrzeugschein und Halterdaten',
      icon: 'car',
      tone: 'brand' as const,
      action: 'Dokument hinzufügen',
    },
  ];

  const evidenceSections = [
    { title: 'TÜV / HU', subtitle: 'Prüftermine und Ergebnisnachweise', icon: 'clipboard-check', tone: 'success' as const, rows: tuvHistory.length },
    { title: 'Service', subtitle: 'Inspektionen, Ölwechsel und Wartung', icon: 'wrench', tone: 'info' as const, rows: serviceHistory.length },
    { title: 'Reparaturen', subtitle: 'Werkstattrechnungen und Schadenbelege', icon: 'file-signature', tone: 'critical' as const, rows: repairHistory.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fahrzeug"
        title="Fahrzeugakte"
        description={vehicleSubtitle}
        icon={<Icon name="file-text" className="w-4 h-4" />}
        meta={<span className="text-[11px] text-muted-foreground truncate">{vehicleName}</span>}
      />
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Dokumente" value="0/4" status="warning" />
        <MetricCard
          label="Kosten"
          value={`${configuredCostLines}/5`}
          status={configuredCostLines >= 3 ? 'success' : 'neutral'}
        />
        <MetricCard
          label="Nachweise"
          value={String(tuvHistory.length + serviceHistory.length + repairHistory.length)}
          status="neutral"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-3 items-start">
        <DataCard
          title="Dokumentenstatus"
          description="Pflichtunterlagen pro Fahrzeug, priorisiert nach operativer Relevanz."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {documentCards.map((doc) => (
              <DocumentTile
                key={doc.title}
                icon={doc.icon}
                title={doc.title}
                description={doc.description}
                action={doc.action}
                tone={doc.tone}
              />
            ))}
          </div>
        </DataCard>

        <DataCard
          title="Monatliche Fixkosten"
          description="Finanzielle Grundlast des Fahrzeugs auf einen Blick."
        >
          <div className="space-y-2.5">
            {monthlyLines.map((item) => (
              <CostRow key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
            <div className="pt-3 mt-3 border-t border-border flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">Gesamt pro Monat</span>
              <span className="text-[13px] font-bold tabular-nums text-foreground">
                {vehicle?.totalMonthlyCost ?? dash}
              </span>
            </div>
          </div>
        </DataCard>
      </div>

      <DataCard
        title="Nachweise & Historie"
        description="TÜV, Service und Reparaturen als ein gemeinsamer Verlauf statt getrennter leerer Tabellen."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {evidenceSections.map((section) => (
            <EvidenceCard key={section.title} {...section} />
          ))}
        </div>
      </DataCard>
    </div>
  );
}

function toneClass(tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral') {
  if (tone === 'brand') return 'sq-tone-brand';
  if (tone === 'info') return 'sq-tone-info';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

function DocumentTile({
  icon,
  title,
  description,
  action,
  tone,
}: {
  icon: string;
  title: string;
  description: string;
  action: string;
  tone: 'brand' | 'info' | 'success' | 'warning';
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 sq-card-elevated transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(tone)}`}>
            <Icon name={icon} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground">{title}</p>
            <p className="text-[10px] mt-0.5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <StatusChip tone="warning">Fehlt</StatusChip>
      </div>
      <button
        type="button"
        disabled
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground opacity-60 cursor-not-allowed"
      >
        <Icon name="upload" className="w-3.5 h-3.5" />
        {action}
      </button>
    </div>
  );
}

function CostRow({ label, value, tone }: { label: string; value: string; tone: 'info' | 'success' | 'warning' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${toneClass(tone)}`} />
        <span className="text-[10px] font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function EvidenceCard({
  title,
  subtitle,
  icon,
  tone,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: string;
  tone: 'info' | 'success' | 'critical';
  rows: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 min-h-[150px] flex flex-col sq-card-elevated transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(tone)}`}>
          <Icon name={icon} className="w-4 h-4" />
        </div>
        <StatusChip tone="neutral">{rows} Einträge</StatusChip>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-semibold text-foreground">{title}</p>
        <p className="text-[10px] mt-0.5 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-auto pt-4">
        {rows === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="file" className="w-3.5 h-3.5" />}
            title="Noch keine Nachweise"
            description="Noch keine Nachweise hinterlegt"
            className="!py-4 !px-0"
          />
        ) : (
          <button type="button" className="text-[10px] font-semibold text-[color:var(--brand)]">Verlauf anzeigen</button>
        )}
      </div>
    </div>
  );
}
