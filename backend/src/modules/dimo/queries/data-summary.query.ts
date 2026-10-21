/**
 * DIMO `dataSummary` for native events + signal inventory (P29 preflight).
 */
export interface DimoEventDataSummaryRow {
  name: string;
  numberOfEvents: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface DimoDataSummaryPayload {
  numberOfSignals?: number | null;
  /** @deprecated DIMO schema uses firstSeen */
  firstSignalSeen?: string | null;
  /** @deprecated DIMO schema uses lastSeen */
  lastSignalSeen?: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  eventDataSummary?: DimoEventDataSummaryRow[] | null;
}

export function buildDataSummaryQuery(tokenId: number): string {
  return `
    query DataSummary {
      dataSummary(tokenId: ${tokenId}) {
        numberOfSignals
        firstSeen
        lastSeen
        eventDataSummary {
          name
          numberOfEvents
          firstSeen
          lastSeen
        }
      }
    }
  `.trim();
}

export function parseDataSummaryResponse(data: unknown): DimoDataSummaryPayload | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const summary = root.dataSummary;
  if (!summary || typeof summary !== 'object') return null;
  const row = summary as DimoDataSummaryPayload;
  return {
    ...row,
    firstSignalSeen: row.firstSignalSeen ?? row.firstSeen ?? null,
    lastSignalSeen: row.lastSignalSeen ?? row.lastSeen ?? null,
  };
}
