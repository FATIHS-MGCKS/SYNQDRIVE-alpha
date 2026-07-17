import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260717230000_document_extraction_v2_control_fields/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Document Intake V2 extraction control fields schema (Prompt 19)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
      encoding: 'utf8',
    });
    expect(output).toContain('valid');
  });

  it('extends VehicleDocumentExtraction with V2 control fields', () => {
    const schema = readSchema();
    const block = schema.match(/model VehicleDocumentExtraction \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    const model = block![0];

    expect(model).toMatch(/vehicleId\s+String\?/);
    expect(model).toMatch(/organizationId\s+String\?/);
    expect(model).toContain('documentCategory');
    expect(model).toContain('documentSubtype');
    expect(model).toContain('classificationVersion');
    expect(model).toContain('contentHash');
    expect(model).toContain('duplicateStatus');
    expect(model).toContain('currentActionPlanId');
    expect(model).toContain('processingMaturity');
    expect(model).toContain('applyStartedAt');
    expect(model).toContain('applyCompletedAt');
    expect(model).toContain('applyFailureCode');
    expect(model).toContain('legacyApplyResult');
    expect(model).toContain('archivedAt');
    expect(model).toContain('organization                      Organization?');
    expect(model).toContain('@relation("ExtractionCurrentActionPlan"');
  });

  it('migration is additive and makes vehicle_id nullable without data loss', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    expect(sql).toContain('ALTER COLUMN "vehicle_id" DROP NOT NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "document_category"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "current_action_plan_id"');
    expect(sql).toContain('vehicle_document_extractions_organization_id_fkey');
    expect(sql).toContain('vehicle_document_extractions_current_action_plan_id_fkey');

    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+"vehicle_document_extractions"/i);
  });
});
