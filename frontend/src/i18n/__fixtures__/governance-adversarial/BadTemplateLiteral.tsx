/** Positive fixture: template literal host framing with raw interpolation */
export function BadTemplateLiteral() {
  const vehicle = { license: 'KS MX 2024' };
  const tooltip = `Keine GPS-Position für ${vehicle.license}`;
  return <span title={tooltip}>—</span>;
}
