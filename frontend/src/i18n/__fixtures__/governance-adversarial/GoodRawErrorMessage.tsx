/** Negative fixture: raw error.message */
export function GoodRawErrorMessage() {
  const error = new Error('provider failure');
  return <span>{error.message}</span>;
}
