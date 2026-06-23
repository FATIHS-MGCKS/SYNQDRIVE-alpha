import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEGACY_BRAKE_UI_PATTERNS = [
  /padsHealthPct/,
  /discsHealthPct/,
  /summary\?\.pads/,
  /summary\?\.discs/,
  /summary\?\.status/,
  /bhd\?\.frontPads/,
  /bhd\?\.rearPads/,
  /bhd\?\.frontDiscs/,
  /bhd\?\.rearDiscs/,
  /\.healthPct/,
];

function readComponent(relativePath: string): string {
  return readFileSync(join(__dirname, '..', relativePath), 'utf8');
}

describe('Brake health UI — canonical-only consumption', () => {
  it('FleetConditionDetailView does not reference legacy brake percent fields', () => {
    const src = readComponent('components/FleetConditionDetailView.tsx');
    for (const pattern of LEGACY_BRAKE_UI_PATTERNS) {
      expect(src).not.toMatch(pattern);
    }
    expect(src).toMatch(/overallCondition/);
    expect(src).toMatch(/frontAxle/);
    expect(src).toMatch(/rearAxle/);
  });

  it('HealthErrorsView brake modal does not reference legacy detail pad/disc estimates', () => {
    const src = readComponent('components/HealthErrorsView.tsx');
    expect(src).not.toMatch(/bhd\?\.frontPads/);
    expect(src).not.toMatch(/bhd\?\.rearPads/);
    expect(src).not.toMatch(/bhd\?\.frontDiscs/);
    expect(src).not.toMatch(/bhd\?\.rearDiscs/);
    expect(src).toMatch(/overallCondition/);
    expect(src).toMatch(/frontAxle/);
  });

  it('HealthVehicleDetailPanel brakes tab does not show legacy health percent', () => {
    const src = readComponent('components/health/HealthVehicleDetailPanel.tsx');
    const brakesBlock =
      src.match(/if \(activeTab === 'brakes'\)[\s\S]*?if \(activeTab === 'battery'\)/)?.[0] ?? '';
    expect(brakesBlock.length).toBeGreaterThan(0);
    expect(brakesBlock).not.toMatch(/padsHealthPct|discsHealthPct/);
    expect(brakesBlock).not.toMatch(/showPercent|percent=/);
    expect(brakesBlock).toMatch(/overallCondition/);
  });
});
