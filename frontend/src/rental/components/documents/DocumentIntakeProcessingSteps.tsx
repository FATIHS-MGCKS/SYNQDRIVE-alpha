import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import type { IntakeProcessingStepView } from '../../lib/document-intake-processing-steps';

function stepIcon(state: IntakeProcessingStepView['state']): ReactNode {
  if (state === 'complete') {
    return <Icon name="check" className="h-3.5 w-3.5 text-[color:var(--status-success)]" aria-hidden />;
  }
  if (state === 'failed') {
    return <Icon name="alert-triangle" className="h-3.5 w-3.5 text-[color:var(--status-critical)]" aria-hidden />;
  }
  if (state === 'active') {
    return <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />;
  }
  return <span className="block h-2 w-2 rounded-full bg-muted-foreground/30" aria-hidden />;
}

function stepRowClass(state: IntakeProcessingStepView['state'], isDarkMode: boolean): string {
  if (state === 'complete') {
    return isDarkMode ? 'text-green-400' : 'text-green-700';
  }
  if (state === 'failed') {
    return isDarkMode ? 'text-red-400' : 'text-red-700';
  }
  if (state === 'active') {
    return isDarkMode ? 'text-white' : 'text-gray-900';
  }
  return isDarkMode ? 'text-gray-500' : 'text-muted-foreground';
}

export interface DocumentIntakeProcessingStepsProps {
  steps: IntakeProcessingStepView[];
  uploadedFileName?: string;
  elapsedLabel?: string | null;
  longRunningHint?: string | null;
  safeLeaveHint?: string | null;
  networkWarning?: string | null;
  isDarkMode?: boolean;
  footerSlot?: ReactNode;
}

export function DocumentIntakeProcessingSteps({
  steps,
  uploadedFileName,
  elapsedLabel,
  longRunningHint,
  safeLeaveHint,
  networkWarning,
  isDarkMode = false,
  footerSlot,
}: DocumentIntakeProcessingStepsProps) {
  return (
    <div className="min-w-0 text-left">
      <ol className="space-y-2" aria-label="Verarbeitungsfortschritt">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`flex items-start gap-3 rounded-lg px-3 py-2 ${step.state === 'active' ? (isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-50') : ''}`}
            aria-current={step.state === 'active' ? 'step' : undefined}
          >
            <div
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                step.state === 'complete'
                  ? 'border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10'
                  : step.state === 'failed'
                    ? 'border-[color:var(--status-critical)]/40 bg-[color:var(--status-critical)]/10'
                    : step.state === 'active'
                      ? 'border-primary/40 bg-primary/10'
                      : isDarkMode
                        ? 'border-neutral-700 bg-neutral-900/40'
                        : 'border-gray-200 bg-white'
              }`}
            >
              {stepIcon(step.state)}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold break-words ${stepRowClass(step.state, isDarkMode)}`}>{step.label}</p>
              {step.detail ? (
                <p
                  className={`mt-0.5 text-[11px] break-words ${
                    step.state === 'failed'
                      ? isDarkMode
                        ? 'text-red-300'
                        : 'text-red-600'
                      : isDarkMode
                        ? 'text-muted-foreground'
                        : 'text-gray-500'
                  }`}
                >
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {uploadedFileName ? (
        <p className={`mt-4 text-[11px] break-all ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
          {uploadedFileName}
        </p>
      ) : null}

      {elapsedLabel ? (
        <p className={`mt-2 text-[11px] ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{elapsedLabel}</p>
      ) : null}

      {longRunningHint ? (
        <p className={`mt-2 text-[11px] break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
          {longRunningHint}
        </p>
      ) : null}

      {safeLeaveHint ? (
        <p className={`mt-1 text-[11px] break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
          {safeLeaveHint}
        </p>
      ) : null}

      {networkWarning ? (
        <p className={`mt-2 text-[11px] break-words ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
          {networkWarning}
        </p>
      ) : null}

      {footerSlot ? <div className="mt-4">{footerSlot}</div> : null}
    </div>
  );
}
