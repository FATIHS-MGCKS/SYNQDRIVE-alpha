import {
  evaluateDiV0S4KillRow,
  type DiV0S4KillEvaluation,
  type DiV0S4KillRowObservation,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4fReadDb } from './di-v0-s4f-read-db';

export type DiV0S4fControlPlaneReadability = 'READABLE' | 'MISSING' | 'UNREADABLE' | 'MALFORMED';

export interface DiV0S4fControlPlaneAuthority {
  readability: DiV0S4fControlPlaneReadability;
  killEvaluation: DiV0S4KillEvaluation;
}

function observationFromRow(killState: unknown): DiV0S4KillRowObservation {
  return { kind: 'ROW', killState };
}

export async function readDiV0S4fControlPlaneAuthority(db: DiV0S4fReadDb): Promise<DiV0S4fControlPlaneAuthority> {
  try {
    const rows = await db.$queryRaw<Array<{ kill_state: string }>>`
      SELECT kill_state::text AS kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    if (rows.length === 0) {
      return {
        readability: 'MISSING',
        killEvaluation: evaluateDiV0S4KillRow({ kind: 'MISSING' }),
      };
    }
    const killEvaluation = evaluateDiV0S4KillRow(observationFromRow(rows[0].kill_state));
    const readability: DiV0S4fControlPlaneReadability =
      killEvaluation.reason === 'DB_KILL_ROW_MALFORMED' ? 'MALFORMED' : 'READABLE';
    return { readability, killEvaluation };
  } catch {
    return {
      readability: 'UNREADABLE',
      killEvaluation: evaluateDiV0S4KillRow({ kind: 'READ_ERROR' }),
    };
  }
}
