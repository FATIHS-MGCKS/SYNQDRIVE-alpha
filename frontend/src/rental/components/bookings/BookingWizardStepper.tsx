import type { LucideIcon } from 'lucide-react';
import { Calendar, Car, Check, CreditCard, Star, User } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';

export const BOOKING_WIZARD_STEPS = [
  { id: 1, label: 'Fahrzeug', icon: Car },
  { id: 2, label: 'Zeitraum', icon: Calendar },
  { id: 3, label: 'Extras', icon: Star },
  { id: 4, label: 'Kunde', icon: User },
  { id: 5, label: 'Abschluss', icon: CreditCard },
] as const satisfies ReadonlyArray<{ id: number; label: string; icon: LucideIcon }>;

export type BookingWizardStepId = (typeof BOOKING_WIZARD_STEPS)[number]['id'];

export interface BookingWizardStepperProps {
  currentStep: number;
  onStepSelect: (stepId: BookingWizardStepId) => void;
  className?: string;
}

/**
 * Booking wizard navigation — compact on mobile, full pills on desktop.
 * Step selection only fires for completed steps (caller enforces validation).
 */
export function BookingWizardStepper({
  currentStep,
  onStepSelect,
  className,
}: BookingWizardStepperProps) {
  const totalSteps = BOOKING_WIZARD_STEPS.length;
  const activeStep = BOOKING_WIZARD_STEPS.find((s) => s.id === currentStep) ?? BOOKING_WIZARD_STEPS[0];
  const progressPercent = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100));

  return (
    <div className={cn('w-full min-w-0 max-w-full', className)}>
      {/* Mobile — compact progress header + dot rail */}
      <div className="space-y-2.5 md:hidden">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-semibold text-foreground">
            Schritt {currentStep} von {totalSteps}
            <span className="font-normal text-muted-foreground"> · {activeStep.label}</span>
          </p>
          {currentStep > 1 && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {currentStep - 1}/{totalSteps - 1} erledigt
            </span>
          )}
        </div>

        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={currentStep}
          aria-label={`Buchungsfortschritt: Schritt ${currentStep} von ${totalSteps}`}
        >
          <div
            className="h-full rounded-full bg-[color:var(--brand)] transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-1">
          {BOOKING_WIZARD_STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const isDisabled = !isCompleted && !isActive;

            return (
              <button
                key={step.id}
                type="button"
                disabled={isDisabled}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${step.label}${isActive ? ' (aktuell)' : isCompleted ? ' (abgeschlossen)' : ''}`}
                onClick={() => {
                  if (isCompleted) onStepSelect(step.id);
                }}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-all',
                  isActive && 'sq-tone-brand border-border ring-1 ring-[color:var(--brand-glow)]',
                  isCompleted &&
                    'sq-tone-success cursor-pointer border-border hover:opacity-90',
                  isDisabled && 'border-border bg-muted/50 text-muted-foreground opacity-60',
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop — full labeled stepper */}
      <div className="hidden md:block">
        <div className="flex w-full min-w-0 items-center justify-between gap-1">
          {BOOKING_WIZARD_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const isDisabled = !isCompleted && !isActive;

            return (
              <div key={step.id} className="flex min-w-0 flex-1 items-center">
                <button
                  type="button"
                  disabled={isDisabled}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => {
                    if (isCompleted) onStepSelect(step.id);
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-2.5 py-2 transition-all duration-200 lg:px-3',
                    isActive && 'sq-tone-brand border-border ring-1 ring-[color:var(--brand-glow)]',
                    isCompleted &&
                      'sq-tone-success cursor-pointer border-border hover:opacity-90',
                    isDisabled && 'border-border bg-muted/40 text-muted-foreground',
                  )}
                >
                  {isCompleted ? (
                    <Icon name="check" className="h-4 w-4 shrink-0" />
                  ) : (
                    <StepIcon className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate text-[11px] font-medium">{step.label}</span>
                </button>

                {index < BOOKING_WIZARD_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-1 h-px w-3 shrink-0 lg:mx-1.5 lg:w-5',
                      isCompleted ? 'bg-[color:var(--status-positive)]/40' : 'bg-border',
                    )}
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
