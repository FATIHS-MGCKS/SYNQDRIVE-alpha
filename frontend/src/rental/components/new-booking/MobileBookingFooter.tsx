import { Icon } from '../ui/Icon';
import type { MobileBookingFooterProps } from './types';

export function MobileBookingFooter({
  currentStep,
  canProceed,
  isSavingBooking,
  onBackStep,
  onNextStep,
  onConfirm,
}: MobileBookingFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 flex w-full min-w-0 max-w-full gap-3 border-t border-border/40 bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      {currentStep > 1 && (
        <button
          type="button"
          onClick={onBackStep}
          className="sq-3d-btn sq-3d-btn--neutral flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs"
        >
          <Icon name="arrow-left" className="h-5 w-5" />
          Zurück
        </button>
      )}
      {currentStep < 5 ? (
        <button
          type="button"
          onClick={onNextStep}
          disabled={!canProceed}
          className="sq-3d-btn sq-3d-btn--primary flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Weiter
          <Icon name="arrow-right" className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canProceed || isSavingBooking}
          className="sq-3d-btn sq-3d-btn--success flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check" className="h-5 w-5" />
          {isSavingBooking ? 'Speichert…' : 'Buchung bestätigen'}
        </button>
      )}
    </div>
  );
}
