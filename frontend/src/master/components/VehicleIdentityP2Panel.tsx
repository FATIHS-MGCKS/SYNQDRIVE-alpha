import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, Loader2, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  isVehicleIdentityP2Enabled,
  provenanceBadgeClass,
  provenanceLabelKey,
  type VehicleIdentityProvenanceUi,
} from '../connected-vehicles/vehicle-identity-p2.util';

type ReviewField = {
  fieldCode: string;
  labelKey: string;
  value: string | number | null;
  provenance: VehicleIdentityProvenanceUi;
  extractionStatus: string | null;
  conflict: boolean;
  dimoValue: string | number | null;
  documentValue: string | number | null;
};

type ReviewSnapshot = {
  fields: ReviewField[];
  vinMismatchBlocked: boolean;
  p2PowerSemanticsWarning: string;
  documentExtractionId: string | null;
  capabilities: { p2Enabled: boolean; zb1UploadEnabled: boolean };
};

type Props = {
  isDarkMode: boolean;
  organizationId: string;
  vehicleId: string;
  dimoDisplacementCc?: number | null;
  dimoMotorPowerKw?: number | null;
  dimoFuelType?: string | null;
};

export function VehicleIdentityP2Panel({
  isDarkMode,
  organizationId,
  vehicleId,
  dimoDisplacementCc,
  dimoMotorPowerKw,
  dimoFuelType,
}: Props) {
  const { t } = useLanguage();
  const enabled = isVehicleIdentityP2Enabled();

  const [manualDisplacement, setManualDisplacement] = useState('');
  const [manualPowerKw, setManualPowerKw] = useState('');
  const [manualFuel, setManualFuel] = useState(dimoFuelType ?? '');
  const [powerKind, setPowerKind] = useState<'COMBUSTION' | 'ELECTRIC_DRIVE' | 'COMBINED_SYSTEM' | ''>('');
  const [electrificationGrade, setElectrificationGrade] = useState('');
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vinAck, setVinAck] = useState(false);
  const [confirmedFields, setConfirmedFields] = useState<Record<string, boolean>>({});
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [validateMsg, setValidateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (dimoDisplacementCc != null) setManualDisplacement(String(dimoDisplacementCc));
    if (dimoMotorPowerKw != null) setManualPowerKw(String(dimoMotorPowerKw));
    if (dimoFuelType) setManualFuel(dimoFuelType);
  }, [dimoDisplacementCc, dimoMotorPowerKw, dimoFuelType]);

  const manualBody = useMemo(
    () => ({
      displacementCc: manualDisplacement ? Number(manualDisplacement) : null,
      motorPowerKw: manualPowerKw ? Number(manualPowerKw) : null,
      fuelType: manualFuel || null,
      powerKind: powerKind || null,
      electrificationGrade: electrificationGrade || null,
    }),
    [manualDisplacement, manualPowerKw, manualFuel, powerKind, electrificationGrade],
  );

  const refreshSnapshot = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.vehicles.registrationIdentityReview.reconcile(organizationId, vehicleId, {
        documentExtractionId: extractionId ?? undefined,
        manual: manualBody,
        vinMismatchAcknowledged: vinAck,
      });
      setSnapshot(data as ReviewSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, organizationId, vehicleId, extractionId, manualBody, vinAck]);

  useEffect(() => {
    if (enabled && organizationId && vehicleId) {
      void refreshSnapshot();
    }
  }, [enabled, organizationId, vehicleId, refreshSnapshot]);

  const onUpload = async (file: File) => {
    if (!snapshot?.capabilities.zb1UploadEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const uploaded = await api.vehicles.uploadDocumentExtraction(
        vehicleId,
        file,
        'REGISTRATION_CERTIFICATE',
        'master_vehicle_identity_p2',
      );
      const id = uploaded?.id ?? uploaded?.extractionId;
      if (typeof id === 'string') {
        setExtractionId(id);
      }
      await refreshSnapshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onValidate = async () => {
    if (!snapshot) return;
    setLoading(true);
    setValidateMsg(null);
    try {
      const confirmations = Object.entries(confirmedFields)
        .filter(([, v]) => v)
        .map(([fieldCode]) => ({ fieldCode, confirmed: true }));
      await api.vehicles.registrationIdentityReview.validateConfirmations(
        organizationId,
        vehicleId,
        {
          documentExtractionId: extractionId ?? undefined,
          manual: manualBody,
          confirmations,
          vinMismatchAcknowledged: vinAck,
          acceptP2AsSystemPower: false,
        },
      );
      setValidateMsg(t('master.vehicleIdentity.validateSuccess'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return (
      <p className="text-xs text-muted-foreground">{t('master.vehicleIdentity.p2Disabled')}</p>
    );
  }

  const reviewRows = (snapshot?.fields ?? []).filter((f) =>
    ['d1Manufacturer', 'd3TradeName', 'd2TypeVariantVersion', 'eVin', 'p1DisplacementCc', 'p2NominalPowerKw', 'p3FuelOrEnergy', 'hsnCode21', 'tsnCode22'].includes(
      f.fieldCode,
    ),
  );

  return (
    <div className="space-y-4" data-testid="vehicle-identity-p2-panel">
      <h4 className="text-sm font-semibold">{t('master.vehicleIdentity.sectionTitle')}</h4>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3 border-border">
          <p className="text-xs font-medium">{t('master.vehicleIdentity.pathManual')}</p>
          <p className="text-[10px] text-muted-foreground">{t('master.vehicleIdentity.dimoPrefillHint')}</p>
          <label className="block text-xs">
            {t('master.vehicleIdentity.displacementCc')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={manualDisplacement}
              onChange={(e) => setManualDisplacement(e.target.value)}
              data-testid="vehicle-identity-manual-displacement"
            />
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.motorPowerKw')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={manualPowerKw}
              onChange={(e) => setManualPowerKw(e.target.value)}
              data-testid="vehicle-identity-manual-power"
            />
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.fuelType')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={manualFuel}
              onChange={(e) => setManualFuel(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.powerKind')}
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={powerKind}
              onChange={(e) => setPowerKind(e.target.value as typeof powerKind)}
            >
              <option value="">—</option>
              <option value="COMBUSTION">{t('master.vehicleIdentity.powerKind.combustion')}</option>
              <option value="ELECTRIC_DRIVE">{t('master.vehicleIdentity.powerKind.electric')}</option>
              <option value="COMBINED_SYSTEM">{t('master.vehicleIdentity.powerKind.combined')}</option>
            </select>
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.electrificationGrade')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={electrificationGrade}
              onChange={(e) => setElectrificationGrade(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-2 rounded-lg border p-3 border-border">
          <p className="text-xs font-medium flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {t('master.vehicleIdentity.pathDocument')}
          </p>
          {snapshot?.capabilities.zb1UploadEnabled ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-primary">
              <Upload className="h-4 w-4" />
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                data-testid="vehicle-identity-zb1-upload"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                }}
              />
              REGISTRATION_CERTIFICATE
            </label>
          ) : (
            <p className="text-[10px] text-muted-foreground">{t('master.vehicleIdentity.uploadDisabled')}</p>
          )}
          {extractionId && (
            <p className="text-[10px] text-muted-foreground">
              {t('master.vehicleIdentity.documentLinked', { id: extractionId })}
            </p>
          )}
        </div>
      </div>

      {snapshot?.vinMismatchBlocked && (
        <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <div>
            <p>{t('master.vehicleIdentity.vinMismatch')}</p>
            <label className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={vinAck} onChange={(e) => setVinAck(e.target.checked)} />
              {t('master.vehicleIdentity.vinMismatchAck')}
            </label>
          </div>
        </div>
      )}

      <p className="text-[10px] text-amber-600 dark:text-amber-400">{snapshot?.p2PowerSemanticsWarning}</p>

      <div className="space-y-2">
        <p className="text-xs font-medium">{t('master.vehicleIdentity.reviewTitle')}</p>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Field</th>
              <th className="py-1">Value</th>
              <th className="py-1">Source</th>
              <th className="py-1">{t('master.vehicleIdentity.confirmField')}</th>
            </tr>
          </thead>
          <tbody>
            {reviewRows.map((row) => (
              <tr key={row.fieldCode} className="border-t border-border/60">
                <td className="py-1 pr-2">{t(row.labelKey as never)}</td>
                <td className="py-1 pr-2 font-mono">{row.value ?? '—'}</td>
                <td className="py-1 pr-2">
                  <span className={provenanceBadgeClass(row.provenance, isDarkMode)}>
                    {t(provenanceLabelKey(row.provenance) as never)}
                  </span>
                  {row.extractionStatus && row.extractionStatus !== 'EXTRACTED' && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {t('master.vehicleIdentity.extractionStatus', { status: row.extractionStatus })}
                    </span>
                  )}
                </td>
                <td className="py-1">
                  <input
                    type="checkbox"
                    disabled={snapshot?.vinMismatchBlocked && !vinAck && row.fieldCode === 'eVin'}
                    checked={!!confirmedFields[row.fieldCode]}
                    onChange={(e) =>
                      setConfirmedFields((prev) => ({ ...prev, [row.fieldCode]: e.target.checked }))
                    }
                    data-testid={`vehicle-identity-confirm-${row.fieldCode}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
        disabled={loading || (snapshot?.vinMismatchBlocked && !vinAck)}
        onClick={() => void onValidate()}
        data-testid="vehicle-identity-validate-confirm"
      >
        {t('master.vehicleIdentity.validateConfirm')}
      </button>
      {validateMsg && <p className="text-xs text-emerald-600">{validateMsg}</p>}
    </div>
  );
}
