import { describe, expect, it } from 'vitest';
import { matchRoutes, type RouteObject } from 'react-router-dom';

/**
 * Child routes mirrored from `OperatorApp.tsx` under parent `/operator/*`.
 * Update together when OperatorApp routes change.
 */
const OPERATOR_APP_CHILD_ROUTES: RouteObject[] = [
  { index: true },
  { path: 'vehicles/:vehicleId' },
  { path: 'bookings/:bookingId' },
  { path: 'scan' },
  { path: '*' },
];

const OPERATOR_ROUTE_TREE: RouteObject[] = [
  {
    path: '/operator',
    children: OPERATOR_APP_CHILD_ROUTES,
  },
];

function leafPattern(pathname: string): string | undefined {
  const matches = matchRoutes(OPERATOR_ROUTE_TREE, { pathname });
  return matches?.at(-1)?.route.path;
}

describe('OperatorApp route matching', () => {
  it('matches index at /operator', () => {
    expect(leafPattern('/operator')).toBeUndefined();
    expect(matchRoutes(OPERATOR_ROUTE_TREE, { pathname: '/operator' })?.length).toBeGreaterThan(0);
  });

  it('matches /operator/scan without wildcard redirect', () => {
    expect(leafPattern('/operator/scan')).toBe('scan');
  });

  it('matches vehicle and booking path params', () => {
    expect(leafPattern('/operator/vehicles/abc')).toBe('vehicles/:vehicleId');
    expect(leafPattern('/operator/bookings/abc')).toBe('bookings/:bookingId');
  });

  it('matches unknown paths on wildcard child', () => {
    expect(leafPattern('/operator/unknown-segment')).toBe('*');
  });
});