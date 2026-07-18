import { describe, expect, it } from 'vitest';
import { buildStationSummariesRequestPath } from './station-summaries-api.utils';

describe('buildStationSummariesRequestPath', () => {
  it('builds the org summaries API path with encoded query params', () => {
    expect(
      buildStationSummariesRequestPath('org-a', {
        page: 2,
        pageSize: 50,
        status: 'ACTIVE',
        type: 'BRANCH',
        isPrimary: true,
        search: 'Berlin',
        hasConfigurationProblems: true,
      }),
    ).toBe(
      '/organizations/org-a/stations/summaries?page=2&pageSize=50&status=ACTIVE&type=BRANCH&isPrimary=true&search=Berlin&hasConfigurationProblems=true',
    );
  });
});
