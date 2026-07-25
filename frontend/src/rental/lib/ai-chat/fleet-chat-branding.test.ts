import { describe, expect, it } from 'vitest';

import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';

const MISLEADING_DIMO_AGENT_PATTERNS = [
  /DIMO Agent Connected/i,
  /Powered by DIMO/i,
  /DIMO Agents API/i,
  /DIMO Agent as an internal tool/i,
  /Vehicle Intelligence \/ DIMO/i,
];

describe('aiChat branding copy', () => {
  it('avoids misleading DIMO-as-chat-agent phrasing in DE and EN', () => {
    const keys = Object.keys(de).filter((key) => key.startsWith('aiChat.') || key === 'whatsapp.ai.description');
    for (const key of keys) {
      const values = [de[key as keyof typeof de], en[key as keyof typeof en]].filter(Boolean);
      for (const value of values) {
        for (const pattern of MISLEADING_DIMO_AGENT_PATTERNS) {
          expect(value).not.toMatch(pattern);
        }
      }
    }
  });
});
