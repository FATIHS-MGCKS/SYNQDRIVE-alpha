import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { DocumentExtractionMetadata } from '../lib/document-extraction.types';

export function useDocumentExtractionMetadata() {
  const [metadata, setMetadata] = useState<DocumentExtractionMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.documentExtraction
      .metadata()
      .then((next) => {
        if (!cancelled) setMetadata(next);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { metadata, loading };
}
