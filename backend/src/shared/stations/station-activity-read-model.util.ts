import type { ActivityAction, ActivityEntity } from '@prisma/client';

export type StationActivityActor = {
  id: string | null;
  displayName: string;
};

export type StationActivityEntryReadModel = {
  id: string;
  action: ActivityAction;
  actionLabel: string;
  entity: ActivityEntity;
  description: string | null;
  changeSummary: string | null;
  actor: StationActivityActor;
  fromLabel: string | null;
  toLabel: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  CONNECT: 'Connected',
  DISCONNECT: 'Disconnected',
  REGISTER: 'Registered',
  IMPORT: 'Imported',
  CONVERT: 'Converted',
  SYNC: 'Synced',
  CANCEL: 'Cancelled',
  SEND: 'Sent',
  AUTH_FAIL: 'Failed attempt',
};

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function summarizeValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => summarizeValue(item)).filter(Boolean);
    return items.length > 0 ? items.join(', ') : null;
  }
  const record = readRecord(value);
  if (!record) return null;
  const preferredKeys = ['label', 'name', 'status', 'value', 'code'];
  for (const key of preferredKeys) {
    const summarized = summarizeValue(record[key]);
    if (summarized) return summarized;
  }
  const pairs = Object.entries(record)
    .slice(0, 3)
    .map(([key, nested]) => {
      const summarized = summarizeValue(nested);
      return summarized ? `${key}: ${summarized}` : null;
    })
    .filter(Boolean);
  return pairs.length > 0 ? pairs.join(' · ') : null;
}

export function resolveStationActivityFromTo(input: {
  changeSummary?: string | null;
  metaJson?: unknown;
}): { fromLabel: string | null; toLabel: string | null } {
  if (input.changeSummary?.trim()) {
    const parts = input.changeSummary.split(/\s*(?:→|->)\s*/);
    if (parts.length >= 2) {
      return {
        fromLabel: parts[0]?.trim() || null,
        toLabel: parts.slice(1).join(' → ').trim() || null,
      };
    }
  }

  const meta = readRecord(input.metaJson);
  if (!meta) return { fromLabel: null, toLabel: null };

  const before = summarizeValue(meta.before);
  const after = summarizeValue(meta.after);
  if (before || after) {
    return { fromLabel: before, toLabel: after };
  }

  const from = summarizeValue(meta.from ?? meta.previous ?? meta.oldValue);
  const to = summarizeValue(meta.to ?? meta.next ?? meta.newValue);
  return { fromLabel: from, toLabel: to };
}

export function buildStationActivityActor(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null): StationActivityActor {
  if (!user) {
    return { id: null, displayName: 'System' };
  }

  const displayName = user.name?.trim() || user.email?.split('@')[0] || 'User';
  return {
    id: user.id,
    displayName,
  };
}

export function mapStationActivityEntry(entry: {
  id: string;
  action: ActivityAction;
  entity: ActivityEntity;
  description: string;
  changeSummary: string | null;
  metaJson: unknown;
  createdAt: Date;
  user: { id: string; name: string | null; email: string | null } | null;
}): StationActivityEntryReadModel {
  const { fromLabel, toLabel } = resolveStationActivityFromTo({
    changeSummary: entry.changeSummary,
    metaJson: entry.metaJson,
  });

  return {
    id: entry.id,
    action: entry.action,
    actionLabel: ACTION_LABELS[entry.action] ?? entry.action,
    entity: entry.entity,
    description: entry.description?.trim() || null,
    changeSummary: entry.changeSummary?.trim() || null,
    actor: buildStationActivityActor(entry.user),
    fromLabel,
    toLabel,
    createdAt: entry.createdAt.toISOString(),
  };
}
