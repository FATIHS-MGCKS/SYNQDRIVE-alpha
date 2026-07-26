import { readFileSync } from 'fs';
import { join } from 'path';
import { NOTIFICATION_EVENT_REGISTRY } from './notification-event-registry';

function extractTranslationKeys(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf8');
  const keys = new Set<string>();
  for (const match of content.matchAll(/'((?:notification)\.[^']+)':/g)) {
    keys.add(match[1]);
  }
  return keys;
}

describe('notification template i18n contract', () => {
  const repoRoot = join(__dirname, '../../../../..');
  const enKeys = extractTranslationKeys(
    join(repoRoot, 'frontend/src/rental/i18n/translations/en.ts'),
  );
  const deKeys = extractTranslationKeys(
    join(repoRoot, 'frontend/src/rental/i18n/translations/de.ts'),
  );

  const registryKeys = new Set<string>();
  for (const def of NOTIFICATION_EVENT_REGISTRY) {
    registryKeys.add(def.titleKey);
    registryKeys.add(def.bodyKey);
    if (def.shortLabelKey) registryKeys.add(def.shortLabelKey);
    if (def.recoveryTitleKey) registryKeys.add(def.recoveryTitleKey);
    if (def.recoveryBodyKey) registryKeys.add(def.recoveryBodyKey);
  }

  it('has EN translations for all registry template keys', () => {
    const missing = [...registryKeys].filter((key) => !enKeys.has(key)).sort();
    expect(missing).toEqual([]);
  });

  it('has DE translations for all registry template keys', () => {
    const missing = [...registryKeys].filter((key) => !deKeys.has(key)).sort();
    expect(missing).toEqual([]);
  });

  it('defines allowedTemplateParams for every event type', () => {
    for (const def of NOTIFICATION_EVENT_REGISTRY) {
      expect(def.allowedTemplateParams?.length).toBeGreaterThan(0);
      for (const required of def.requiredTemplateParams) {
        expect(def.allowedTemplateParams).toContain(required);
      }
    }
  });
});
