import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import type { Organization } from '../data/platform-data';
import type { VehicleImportPreflightDto, VehicleOperationalRowDto } from './types';

interface ConnectedVehicleImportWizardProps {
  organizations: Organization[];
  onImported: () => void;
  onOpenVehicle: (vehicleId: string) => void;
}

export function ConnectedVehicleImportWizard({
  organizations,
  onImported,
  onOpenVehicle,
}: ConnectedVehicleImportWizardProps) {
  const [organizationId, setOrganizationId] = useState('');
  const [candidates, setCandidates] = useState<VehicleOperationalRowDto[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedDimoId, setSelectedDimoId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<VehicleImportPreflightDto | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successVehicleId, setSuccessVehicleId] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const res = await api.vehicles.operationalList({
        registrationState: 'unregistered',
        limit: 50,
        page: 1,
        sort: 'attention',
      });
      setCandidates(res.data ?? []);
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!organizationId || !selectedDimoId) {
      setPreflight(null);
      return;
    }
    const run = async () => {
      setPreflightLoading(true);
      setError(null);
      try {
        const res = await api.vehicles.importPreflight(organizationId, selectedDimoId);
        setPreflight(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Preflight fehlgeschlagen');
        setPreflight(null);
      } finally {
        setPreflightLoading(false);
      }
    };
    void run();
  }, [organizationId, selectedDimoId]);

  const handleImport = async () => {
    if (!preflight?.canProceed || !organizationId || !selectedDimoId) return;
    setImporting(true);
    setError(null);
    try {
      const created = await api.vehicles.registerFromDimo(organizationId, {
        dimoVehicleId: selectedDimoId,
        extraData: {},
      });
      const id = created?.id ?? created?.vehicle?.id;
      setSuccessVehicleId(id ?? null);
      onImported();
      await loadCandidates();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Import fehlgeschlagen';
      setError(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="cv-import-wizard">
      <div className="surface-premium rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">1. Zielorganisation</h3>
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          aria-label="Zielorganisation wählen"
        >
          <option value="">Organisation wählen…</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.company_name}
            </option>
          ))}
        </select>
      </div>

      <div className="surface-premium rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">2. DIMO-Fahrzeug (nicht zugeordnet)</h3>
        {candidatesLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Kandidaten werden geladen…
          </p>
        ) : (
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={selectedDimoId ?? ''}
            onChange={(e) => setSelectedDimoId(e.target.value || null)}
            aria-label="DIMO-Fahrzeug wählen"
          >
            <option value="">Fahrzeug wählen…</option>
            {candidates.map((c) => (
              <option key={c.dimoVehicleId!} value={c.dimoVehicleId!}>
                {c.displayTitle} — {c.vin ?? 'ohne VIN'}
              </option>
            ))}
          </select>
        )}
      </div>

      {organizationId && selectedDimoId ? (
        <div className="surface-premium rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">3. Preflight</h3>
          {preflightLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Konflikte werden geprüft…
            </p>
          ) : preflight ? (
            <>
              {preflight.conflict ? (
                <div className="rounded-xl border border-[color:var(--status-critical)]/40 p-4 flex gap-3" role="alert">
                  <AlertTriangle className="h-5 w-5 text-[color:var(--status-critical)] shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">{preflight.conflict.message}</p>
                    {preflight.conflict.existingOrganizationName ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        Bereits bei: {preflight.conflict.existingOrganizationName}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[color:var(--status-success)]/40 p-4 flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[color:var(--status-success)] shrink-0" aria-hidden />
                  <p className="text-sm text-muted-foreground">Kein Konflikt — Import kann fortgesetzt werden.</p>
                </div>
              )}
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {preflight.effects.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
              <Button
                type="button"
                disabled={!preflight.canProceed || importing}
                onClick={() => void handleImport()}
              >
                {importing ? 'Import läuft…' : 'Import bestätigen'}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[color:var(--status-critical)]" role="alert">
          {error}
        </p>
      ) : null}

      {successVehicleId ? (
        <div className="rounded-xl border border-[color:var(--status-success)]/40 p-4 flex flex-wrap items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-[color:var(--status-success)]" aria-hidden />
          <span className="text-sm">Import erfolgreich.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenVehicle(successVehicleId)}>
            Fahrzeug öffnen
          </Button>
        </div>
      ) : null}
    </div>
  );
}
