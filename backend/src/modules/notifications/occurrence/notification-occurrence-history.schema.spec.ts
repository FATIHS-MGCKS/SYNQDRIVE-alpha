import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260726130000_notification_occurrence_history/migration.sql',
);

describe('Notification occurrence history schema (Remediation Prompt 9)', () => {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('defines occurrence traceability columns', () => {
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?sourceEventId/);
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?observedAt/);
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?recoveryState/);
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?correlationId/);
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?causationId/);
    expect(schema).toContain('@@unique([notificationId, sourceEventId])');
  });

  it('migration backfills source_event_id and adds dedupe index', () => {
    expect(sql).toContain('RENAME COLUMN "detected_at" TO "observed_at"');
    expect(sql).toContain('notification_occurrences_notification_source_event_id_key');
    expect(sql).toContain('notification_occurrences_org_observed_at_idx');
    expect(sql).toContain('notification_occurrences_created_at_idx');
  });
});
