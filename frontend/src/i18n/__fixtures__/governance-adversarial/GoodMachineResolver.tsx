/** Negative fixture: machine resolver */
export function GoodMachineResolver() {
  const locale = 'de';
  const machine = 'confirmed';
  const label = machine === 'confirmed' ? 'confirmed' : machine;
  return <span>{labelVendorStatus(locale, machine)}</span>;
}

function labelVendorStatus(_locale: string, status: string) {
  return status;
}
