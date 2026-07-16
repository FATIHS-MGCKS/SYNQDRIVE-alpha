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
  firstSignalSeen?: string | null;
  lastSignalSeen?: string | null;
  eventDataSummary?: DimoEventDataSummaryRow[] | null;
}

export function buildDataSummaryQuery(tokenId: number): string {
  return `
    query DataSummary {
      dataSummary(tokenId: ${tokenId}) {
        numberOfSignals
        firstSignalSeen
        lastSignalSeen
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
  return summary as DimoDataSummaryPayload;
}
