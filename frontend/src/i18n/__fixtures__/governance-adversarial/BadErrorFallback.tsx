import { useState } from 'react';

/** Positive fixture: user-facing setError fallback */
export function BadErrorFallback() {
  const [, setError] = useState<string | null>(null);
  setError('Dokumente konnten nicht geladen werden');
  return null;
}
