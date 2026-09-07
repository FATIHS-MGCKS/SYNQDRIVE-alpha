import type { PendingSnapshotWakeRecord, SuccessorSnapshotWakeRecord } from './snapshot-wake.types';
import { mergePendingWakeContext } from './snapshot-wake.util';
import {
  ACK_PENDING_WAKE_SCRIPT,
  ACK_SUCCESSOR_HANDOFF_SCRIPT,
  ATOMIC_PENDING_WAKE_MERGE_SCRIPT,
  ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
} from './snapshot-wake-redis.scripts';

/**
 * In-memory Redis eval harness mirroring production Lua semantics for unit tests.
 */
export function createSnapshotWakeRedisTestHarness() {
  const store = new Map<string, string>();
  const locks = new Map<string, Promise<void>>();

  async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(
      key,
      prev.then(() => gate),
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  const redis = {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    scan: jest.fn(
      async (cursor: string | number, ...args: string[]): Promise<[string, string[]]> => {
        const matchIdx = args.indexOf('MATCH');
        const pattern = matchIdx >= 0 ? args[matchIdx + 1] : '*';
        const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
        const keys = [...store.keys()]
          .filter((k) =>
            pattern.includes('*') ? k.startsWith(prefix) : k === pattern,
          )
          .sort();
        return ['0', keys];
      },
    ),
    eval: jest.fn(
      async (script: string, _numKeys: number, key: string, ...args: string[]) => {
        return withKeyLock(key, async () => {
          if (script === ATOMIC_PENDING_WAKE_MERGE_SCRIPT) {
            const incomingWake = JSON.parse(args[0]);
            const dimoTokenId = Number(args[1]);
            const updatedAtMs = Number(args[2]);
            const raw = store.get(key);
            let version = 0;
            let existingWake: ReturnType<typeof mergePendingWakeContext> | undefined;
            if (raw) {
              const existing = JSON.parse(raw) as PendingSnapshotWakeRecord;
              version = existing.version ?? 0;
              existingWake = existing.wakeContext;
            }
            const mergedWake = mergePendingWakeContext(existingWake, incomingWake);
            const record: PendingSnapshotWakeRecord = {
              dimoTokenId,
              wakeContext: mergedWake,
              updatedAtMs,
              version: version + 1,
            };
            store.set(key, JSON.stringify(record));
            return JSON.stringify({ ok: true, version: record.version });
          }

          if (script === ACK_PENDING_WAKE_SCRIPT) {
            const raw = store.get(key);
            if (!raw) return 0;
            const record = JSON.parse(raw) as PendingSnapshotWakeRecord;
            if (record.version === Number(args[0])) {
              store.delete(key);
              return 1;
            }
            return 0;
          }

          if (script === ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT) {
            const incoming = JSON.parse(args[0]) as Omit<
              SuccessorSnapshotWakeRecord,
              'version' | 'updatedAtMs'
            >;
            const updatedAtMs = Number(args[1]);
            const raw = store.get(key);
            let version = 0;
            let merged: SuccessorSnapshotWakeRecord = {
              ...incoming,
              version: 1,
              updatedAtMs,
            };
            if (raw) {
              const existing = JSON.parse(raw) as SuccessorSnapshotWakeRecord;
              version = existing.version ?? 0;
              merged = {
                dimoTokenId: incoming.dimoTokenId,
                origin: incoming.origin,
                wakeContext: mergePendingWakeContext(
                  existing.wakeContext,
                  incoming.wakeContext,
                ),
                notBeforeMs: Math.min(existing.notBeforeMs, incoming.notBeforeMs),
                updatedAtMs,
                version: version + 1,
              };
              const exObs = existing.wakeContext.providerObservedAt;
              const inObs = incoming.wakeContext.providerObservedAt;
              const exRecv = existing.wakeContext.receivedAt ?? '';
              const inRecv = incoming.wakeContext.receivedAt ?? '';
              if (inObs != null && exObs != null && inObs === exObs) {
                if (inRecv >= exRecv) {
                  merged.wakeContext = incoming.wakeContext;
                  merged.origin = incoming.origin;
                } else {
                  merged.wakeContext = existing.wakeContext;
                  merged.origin = existing.origin;
                }
              } else if (
                inObs != null &&
                (exObs == null || inObs > exObs)
              ) {
                merged.wakeContext = incoming.wakeContext;
                merged.origin = incoming.origin;
              } else {
                merged.wakeContext = existing.wakeContext;
                merged.origin = existing.origin;
              }
            }
            store.set(key, JSON.stringify(merged));
            return JSON.stringify({
              ok: true,
              version: merged.version,
              notBeforeMs: merged.notBeforeMs,
            });
          }

          if (script === ACK_SUCCESSOR_HANDOFF_SCRIPT) {
            const raw = store.get(key);
            if (!raw) return 0;
            const record = JSON.parse(raw) as SuccessorSnapshotWakeRecord;
            if (record.version === Number(args[0])) {
              store.delete(key);
              return 1;
            }
            return 0;
          }

          throw new Error(`Unknown redis script in test harness: ${script.slice(0, 40)}`);
        });
      },
    ),
  };

  return redis;
}
