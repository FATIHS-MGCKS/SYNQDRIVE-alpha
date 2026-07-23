import type { ReactNode } from 'react';
import { legalLifecycleFieldErrorId, legalUploadFieldErrorId } from './legal-documents-a11y';

type ErrorMap = Record<string, string | undefined>;

export function legalUploadInputA11y(field: string, errors: ErrorMap) {
  const message = errors[field];
  if (!message) return {};
  return {
    'aria-invalid': true as const,
    'aria-describedby': legalUploadFieldErrorId(field),
  };
}

export function legalLifecycleInputA11y(field: string, errors: ErrorMap) {
  const message = errors[field];
  if (!message) return {};
  return {
    'aria-invalid': true as const,
    'aria-describedby': legalLifecycleFieldErrorId(field),
  };
}

export function LegalUploadFieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={legalUploadFieldErrorId(field)}
      className="mt-1 text-[11px] text-[color:var(--status-critical)]"
      role="alert"
    >
      {message}
    </p>
  );
}

export function LegalLifecycleFieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={legalLifecycleFieldErrorId(field)}
      className="mt-1 text-[11px] text-[color:var(--status-critical)]"
      role="alert"
    >
      {message}
    </p>
  );
}

export function FormErrorSummary({
  id,
  title,
  errors,
}: {
  id: string;
  title: string;
  errors: Record<string, string | undefined>;
}) {
  const messages = Object.entries(errors).filter(([, value]) => Boolean(value?.trim()));
  if (messages.length === 0) return null;

  return (
    <div
      id={id}
      role="alert"
      tabIndex={-1}
      className="mb-4 rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/10 px-3 py-2 text-[12px] text-foreground"
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {messages.map(([field, message]) => (
          <li key={field}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function LiveStatusMessage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="status" aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}
