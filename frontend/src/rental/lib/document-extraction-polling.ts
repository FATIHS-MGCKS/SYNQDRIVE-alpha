import type { PublicDocumentExtraction } from './document-extraction.types';
import { isTerminalExtractionStatus } from './document-extraction-lifecycle';

export interface ExtractionPollerOptions {
  fetchRecord: () => Promise<PublicDocumentExtraction>;
  onRecord: (record: PublicDocumentExtraction) => void;
  onError?: (error: unknown, consecutiveFailures: number) => void;
  signal?: AbortSignal;
}

function getPollIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 20_000) return 2_000;
  if (elapsedMs < 60_000) return 5_000;
  return 10_000;
}

export function createExtractionPoller(options: ExtractionPollerOptions) {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let consecutiveFailures = 0;
  let stopped = false;

  const clear = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const stop = () => {
    stopped = true;
    clear();
  };

  const schedule = () => {
    if (stopped || options.signal?.aborted) return;
    const elapsed = Date.now() - startedAt;
    timeoutId = setTimeout(() => void tick(), getPollIntervalMs(elapsed));
  };

  const tick = async () => {
    if (stopped || options.signal?.aborted) return;
    if (inFlight) {
      schedule();
      return;
    }
    inFlight = true;
    try {
      const record = await options.fetchRecord();
      consecutiveFailures = 0;
      options.onRecord(record);
      if (isTerminalExtractionStatus(record.status) || options.signal?.aborted) {
        stop();
        return;
      }
    } catch (error) {
      consecutiveFailures += 1;
      options.onError?.(error, consecutiveFailures);
    } finally {
      inFlight = false;
      if (!stopped) schedule();
    }
  };

  if (options.signal) {
    options.signal.addEventListener('abort', stop, { once: true });
  }

  void tick();

  return { stop };
}

export function getPollIntervalMsForTest(elapsedMs: number): number {
  return getPollIntervalMs(elapsedMs);
}
