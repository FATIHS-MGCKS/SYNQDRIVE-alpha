import { useCallback, useState } from 'react';
import { SignaturePad } from '../../rental/components/handover/SignaturePad';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import { getOperatorUserId } from '../tasks/operatorTask.utils';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import { operatorFieldClass, OperatorHandoverField } from './operatorHandoverUi';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import {
  createOperatorHandoverSignatureBinding,
  HANDOVER_OPERATOR_SIGNATURE_CONSENT_TEXT,
  HANDOVER_SIGNATURE_CONSENT_TEXT,
  signatureClientUploadId,
} from './operatorHandoverSignatureBinding';
import type { OperatorHandoverBookingRef } from './operatorHandoverPayload';

interface Props {
  form: OperatorHandoverFormApi;
  staffOptions: { id: string; name: string }[];
  isDarkMode: boolean;
  stepErrors: string[];
  orgId: string;
  kind: HandoverDialogKind;
  booking: OperatorHandoverBookingRef;
  handoverSessionId: string | null;
  draftVersion: number | null;
}

export function OperatorHandoverStepSignatures({
  form,
  staffOptions,
  isDarkMode,
  stepErrors,
  orgId,
  kind,
  booking,
  handoverSessionId,
  draftVersion,
}: Props) {
  const isTablet = useOperatorTabletLayout();
  const [mobileSigPhase, setMobileSigPhase] = useState<'customer' | 'staff'>('customer');
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [customerConsent, setCustomerConsent] = useState(false);
  const [staffConsent, setStaffConsent] = useState(false);

  const capturedBy = getOperatorUserId() ?? form.state.staffId ?? '';

  const bindSignature = useCallback(
    async (role: 'customer' | 'operator', dataUrl: string | null, typedName: string) => {
      if (!dataUrl?.trim()) {
        form.patchState(
          role === 'customer'
            ? { customerSigData: null, customerSignatureBinding: null }
            : { staffSigData: null, staffSignatureBinding: null },
        );
        return;
      }
      if (!handoverSessionId || draftVersion == null || !capturedBy) {
        setBindingError('Signatur kann erst nach Draft-Sync gespeichert werden.');
        return;
      }
      try {
        const binding = await createOperatorHandoverSignatureBinding({
          role,
          dataUrl,
          typedName,
          payloadInput: { kind, booking, state: form.state },
          organizationId: orgId,
          bookingId: booking.id,
          customerId: booking.customerId ?? null,
          handoverSessionId,
          draftVersion,
          capturedBy,
          stationId: form.state.actualStationId || null,
          staffId: form.state.staffId || null,
        });
        setBindingError(null);
        form.patchState(
          role === 'customer'
            ? {
                customerSigData: dataUrl,
                customerSignatureBinding: binding,
                signaturesInvalidated: false,
              }
            : {
                staffSigData: dataUrl,
                staffSignatureBinding: binding,
                signaturesInvalidated: false,
              },
        );
      } catch {
        setBindingError('Signatur konnte nicht an den Protokollinhalt gebunden werden.');
        form.patchState(
          role === 'customer'
            ? { customerSigData: null, customerSignatureBinding: null }
            : { staffSigData: null, staffSignatureBinding: null },
        );
      }
    },
    [booking, capturedBy, draftVersion, form, handoverSessionId, kind, orgId],
  );

  return (
    <div className="space-y-4">
      {form.state.signaturesInvalidated && (
        <p
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          Der Protokollinhalt wurde nach der Unterschrift geändert. Bitte erneut unterschreiben.
        </p>
      )}

      <OperatorHandoverField label="Übergabe durch *">
        {staffOptions.length > 0 ? (
          <select
            value={form.state.staffId}
            onChange={(e) => {
              const id = e.target.value;
              const match = staffOptions.find((s) => s.id === id);
              form.patchState({ staffId: id, staffName: match?.name ?? '' });
            }}
            className={operatorFieldClass}
          >
            <option value="">Mitarbeiter wählen</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={form.state.staffName}
            onChange={(e) => form.patchState({ staffName: e.target.value })}
            placeholder="Name des Mitarbeiters"
            className={operatorFieldClass}
          />
        )}
        {staffOptions.length > 0 && (
          <input
            type="text"
            value={form.state.staffName}
            onChange={(e) => form.patchState({ staffName: e.target.value })}
            placeholder="Name ergänzen (optional)"
            className={`mt-2 ${operatorFieldClass}`}
          />
        )}
      </OperatorHandoverField>

      {!isTablet && (
        <div className="sq-tab-bar w-full" role="tablist" aria-label="Unterschrift Rolle">
          <button
            type="button"
            role="tab"
            aria-selected={mobileSigPhase === 'customer'}
            data-active={mobileSigPhase === 'customer' ? 'true' : undefined}
            className="flex-1 min-h-[44px]"
            onClick={() => setMobileSigPhase('customer')}
          >
            Kunde
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileSigPhase === 'staff'}
            data-active={mobileSigPhase === 'staff' ? 'true' : undefined}
            className="flex-1 min-h-[44px]"
            onClick={() => setMobileSigPhase('staff')}
          >
            Mitarbeiter
          </button>
        </div>
      )}

      <div className={isTablet ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
        {(!isTablet ? mobileSigPhase === 'customer' : true) && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={customerConsent}
                onChange={(e) => setCustomerConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>{HANDOVER_SIGNATURE_CONSENT_TEXT}</span>
            </label>
            <SignaturePad
              isDarkMode={isDarkMode}
              label="Unterschrift Kunde *"
              typedName={form.state.customerSigName}
              onTypedNameChange={(v) => form.patchState({ customerSigName: v })}
              dataUrl={form.state.customerSigData}
              onDataUrlChange={(v) => {
                if (!customerConsent) {
                  setBindingError('Bitte zuerst die Einwilligung bestätigen.');
                  return;
                }
                void bindSignature('customer', v, form.state.customerSigName);
              }}
              required
              disabled={!customerConsent}
              canvasHeight="min(42vh, 220px)"
              helperText="Zeichnen ist Pflicht — Name ergänzt nur das Protokoll."
              ariaDescription={HANDOVER_SIGNATURE_CONSENT_TEXT}
            />
            {handoverSessionId && (
              <p className="text-[10px] text-muted-foreground">
                Upload-Referenz: {signatureClientUploadId(handoverSessionId, 'customer')}
              </p>
            )}
          </div>
        )}
        {(!isTablet ? mobileSigPhase === 'staff' : true) && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={staffConsent}
                onChange={(e) => setStaffConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>{HANDOVER_OPERATOR_SIGNATURE_CONSENT_TEXT}</span>
            </label>
            <SignaturePad
              isDarkMode={isDarkMode}
              label="Unterschrift Mitarbeiter *"
              typedName={form.state.staffSigName}
              onTypedNameChange={(v) => form.patchState({ staffSigName: v })}
              dataUrl={form.state.staffSigData}
              onDataUrlChange={(v) => {
                if (!staffConsent) {
                  setBindingError('Bitte zuerst die Einwilligung bestätigen.');
                  return;
                }
                void bindSignature('operator', v, form.state.staffSigName);
              }}
              required
              disabled={!staffConsent}
              canvasHeight="min(42vh, 220px)"
              helperText="Zeichnen ist Pflicht."
              ariaDescription={HANDOVER_OPERATOR_SIGNATURE_CONSENT_TEXT}
            />
            {handoverSessionId && (
              <p className="text-[10px] text-muted-foreground">
                Upload-Referenz: {signatureClientUploadId(handoverSessionId, 'operator')}
              </p>
            )}
          </div>
        )}
      </div>

      {bindingError && (
        <p role="alert" className="text-xs text-[color:var(--status-critical)]">
          {bindingError}
        </p>
      )}

      {stepErrors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-3 py-2 text-xs text-[color:var(--status-critical)]">
          {stepErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
