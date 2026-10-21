/** Positive fixture: conditional aria-label literals */
export function BadConditionalAria() {
  const isHome = true;
  const aria = isHome ? 'Zuhause Status' : 'Unterwegs Status';
  return <button aria-label={aria}>X</button>;
}
