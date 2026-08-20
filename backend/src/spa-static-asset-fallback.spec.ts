import * as pathToRegexp from 'path-to-regexp';

/** Mirrors @nestjs/serve-static isRouteExcluded for regression tests. */
function isRouteExcluded(pathname: string, paths: string[]): boolean {
  return paths.some((path) => {
    const re = pathToRegexp(path);
    return re.exec(`${pathname}/`) != null;
  });
}

describe('ServeStatic SPA fallback exclusions', () => {
  const excludes = ['/api/(.*)', '/assets/(.*)'];

  it('does not SPA-fallback missing hashed JS bundles under /assets', () => {
    expect(isRouteExcluded('/assets/index-Bn0ZPwNs.js', excludes)).toBe(true);
  });

  it('still SPA-fallbacks client routes such as /rental', () => {
    expect(isRouteExcluded('/rental', excludes)).toBe(false);
  });

  it('excludes API paths from SPA fallback', () => {
    expect(isRouteExcluded('/api/v1/health', excludes)).toBe(true);
  });
});
