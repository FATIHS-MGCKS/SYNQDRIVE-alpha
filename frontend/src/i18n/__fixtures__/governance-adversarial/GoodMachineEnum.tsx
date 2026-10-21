/** Negative fixture: machine enum must not be flagged */
export function GoodMachineEnum() {
  const state: 'home' | 'away' | 'unknown' = 'home';
  return <span data-state={state}>X</span>;
}
