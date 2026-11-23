import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const ENGINEERING_HUB_SOURCES: Array<{ id: string; relPath: string; integratedTabs?: boolean }> = [
  { id: 'vsi', relPath: 'intelligence/VsiMasterIntelligenceView.tsx' },
  { id: 'apds', relPath: 'intelligence/ApdsMasterIntelligenceView.tsx' },
  { id: 'tire', relPath: 'tire-v3-calibration-center/TireCalibrationCenterView.tsx', integratedTabs: true },
  { id: 'battery-lv', relPath: 'battery-v2-shadow-inspection/BatteryV2ShadowInspectionView.tsx' },
  { id: 'battery-hv', relPath: 'battery-v2-hv-inspection/HvBatteryInspectionView.tsx' },
];

function readSource(relPath: string): string {
  return readFileSync(join(srcRoot, relPath), 'utf8');
}

describe('UX-010 engineering hub MasterPageHeader contract', () => {
  it.each(ENGINEERING_HUB_SOURCES)('$id uses context variant with description', ({ relPath }) => {
    const src = readSource(relPath);
    expect(src).toMatch(/<MasterPageHeader[\s\S]*?variant="context"/);
    expect(src).toMatch(/description=/);
  });

  it('tire calibration integrates tabs in MasterPageHeader (PlatformOps hub pattern)', () => {
    const src = readSource('tire-v3-calibration-center/TireCalibrationCenterView.tsx');
    expect(src).toMatch(/tabs=\{tabs\}/);
    expect(src).toMatch(/tabsAriaLabel=/);
    expect(src).not.toMatch(/<MasterPageTabs/);
  });
});