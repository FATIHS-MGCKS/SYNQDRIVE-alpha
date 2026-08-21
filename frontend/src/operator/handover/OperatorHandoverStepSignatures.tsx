import { useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { SignaturePad } from '../../rental/components/handover/SignaturePad';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import type { OperatorHandoverValidationIssue } from './operatorHandoverPayload';
import { oh, resolveOperatorValidationMessage } from './operator-handover-i18n';
import { operatorFieldClass, OperatorHandoverField } from './operatorHandoverUi';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';

interface Props {
  form: OperatorHandoverFormApi;
  staffOptions: { id: string; name: string }[];
  isDarkMode: boolean;
  stepErrors: OperatorHandoverValidationIssue[];
}

export function OperatorHandoverStepSignatures({
  form,
  staffOptions,
  isDarkMode,
  stepErrors,
}: Props) {
  const { locale } = useLanguage();
  const isTablet = useOperatorTabletLayout();
  const [mobileSigPhase, setMobileSigPhase] = useState<'customer' | 'staff'>('customer');

  return (
    <div className="space-y-4">
      <OperatorHandoverField label={oh(locale, 'handover.operator.signatures.handoverBy')}>
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
            <option value="">{oh(locale, 'handover.operator.signatures.selectStaff')}</option>
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
            placeholder={oh(locale, 'handover.operator.signatures.staffNamePlaceholder')}
            className={operatorFieldClass}
          />
        )}
        {staffOptions.length > 0 && (
          <input
            type="text"
            value={form.state.staffName}
            onChange={(e) => form.patchState({ staffName: e.target.value })}
            placeholder={oh(locale, 'handover.operator.signatures.staffNameOptional')}
            className={`mt-2 ${operatorFieldClass}`}
          />
        )}
      </OperatorHandoverField>

      {!isTablet && (
        <div className="sq-tab-bar w-full">
          <button
            type="button"
            data-active={mobileSigPhase === 'customer' ? 'true' : undefined}
            className="flex-1 min-h-[44px]"
            onClick={() => setMobileSigPhase('customer')}
          >
            {oh(locale, 'handover.operator.signatures.customerTab')}
          </button>
          <button
            type="button"
            data-active={mobileSigPhase === 'staff' ? 'true' : undefined}
            className="flex-1 min-h-[44px]"
            onClick={() => setMobileSigPhase('staff')}
          >
            {oh(locale, 'handover.operator.signatures.staffTab')}
          </button>
        </div>
      )}

      <div className={isTablet ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
        {(!isTablet ? mobileSigPhase === 'customer' : true) && (
          <SignaturePad
            isDarkMode={isDarkMode}
            label={oh(locale, 'handover.operator.signatures.customerPadLabel')}
            typedName={form.state.customerSigName}
            onTypedNameChange={(v) => form.patchState({ customerSigName: v })}
            dataUrl={form.state.customerSigData}
            onDataUrlChange={(v) => form.patchState({ customerSigData: v })}
            required
            canvasHeight="min(42vh, 220px)"
            helperText={oh(locale, 'handover.operator.signatures.customerHelper')}
          />
        )}
        {(!isTablet ? mobileSigPhase === 'staff' : true) && (
          <SignaturePad
            isDarkMode={isDarkMode}
            label={oh(locale, 'handover.operator.signatures.staffPadLabel')}
            typedName={form.state.staffSigName}
            onTypedNameChange={(v) => form.patchState({ staffSigName: v })}
            dataUrl={form.state.staffSigData}
            onDataUrlChange={(v) => form.patchState({ staffSigData: v })}
            required
            canvasHeight="min(42vh, 220px)"
            helperText={oh(locale, 'handover.operator.signatures.staffHelper')}
          />
        )}
      </div>

      {stepErrors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-3 py-2 text-xs text-[color:var(--status-critical)]">
          {stepErrors.map((issue) => (
            <li key={`${issue.field}-${issue.messageKey}`}>
              {resolveOperatorValidationMessage(locale, issue)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
