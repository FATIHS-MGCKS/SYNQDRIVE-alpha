import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { DocumentIntakeEntryRequest } from '../../lib/document-intake-entry';
import { useRentalEntityNavigation } from '../../context/RentalEntityNavigationContext';

interface DocumentIntakeLaunchButtonProps {
  request: DocumentIntakeEntryRequest;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

/** Routes to canonical Document Intake V2 page with optional unconfirmed context. */
export function DocumentIntakeLaunchButton({
  request,
  children,
  className,
  disabled = false,
  type = 'button',
}: DocumentIntakeLaunchButtonProps) {
  const { openDocumentIntake } = useRentalEntityNavigation();

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={() => openDocumentIntake(request)}
      className={className}
    >
      {children}
    </button>
  );
}

export function DocumentIntakeLaunchAiButton({
  request,
  label,
  className,
  disabled,
}: {
  request: DocumentIntakeEntryRequest;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <DocumentIntakeLaunchButton request={request} className={className} disabled={disabled}>
      <Sparkles className="h-4 w-4" />
      {label}
    </DocumentIntakeLaunchButton>
  );
}
