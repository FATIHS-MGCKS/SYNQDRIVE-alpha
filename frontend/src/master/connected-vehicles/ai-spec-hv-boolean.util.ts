/** Map AI hvBatteryPresent (boolean or legacy 0/1) to form string values. */
export function formatAiHvBatteryPresentForForm(value: unknown): string | null {
  if (value === true || value === 1 || value === '1' || value === 'true') return 'true';
  if (value === false || value === 0 || value === '0' || value === 'false') return 'false';
  return null;
}
