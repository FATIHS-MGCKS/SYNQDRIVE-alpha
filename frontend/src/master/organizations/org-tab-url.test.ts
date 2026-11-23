// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { readOrgTabFromUrl, writeOrgTabToUrl } from './org.utils';

describe('organization detail orgTab URL', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/master?view=organizations');
  });

  it('reads and writes orgTab query param', () => {
    writeOrgTabToUrl('billing', true);
    expect(readOrgTabFromUrl()).toBe('billing');
    expect(window.location.search).toContain('orgTab=billing');
  });

  it('pushState enables history navigation for tab restores', () => {
    writeOrgTabToUrl('overview', true);
    writeOrgTabToUrl('settings');
    expect(readOrgTabFromUrl()).toBe('settings');

    window.history.back();
    expect(readOrgTabFromUrl()).toBe('overview');

    window.history.forward();
    expect(readOrgTabFromUrl()).toBe('settings');
  });
});