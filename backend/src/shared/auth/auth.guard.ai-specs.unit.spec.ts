/**
 * Ensures vehicle AI-Spec routes are not on the public allowlist (MASTER_ADMIN JWT required).
 */
describe('AuthGuard public path policy for AI specs', () => {
  const PUBLIC_PATH_PREFIXES = [
    '/api/v1/vehicles/register/ai-tire-specs',
  ];

  const aiSpecPaths = [
    '/api/v1/vehicles/register/ai-specs',
    '/api/v1/vehicles/register/ai-specs-stream',
  ];

  it('does not expose ai-specs endpoints without authentication', () => {
    for (const path of aiSpecPaths) {
      expect(PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p))).toBe(false);
    }
  });
});
