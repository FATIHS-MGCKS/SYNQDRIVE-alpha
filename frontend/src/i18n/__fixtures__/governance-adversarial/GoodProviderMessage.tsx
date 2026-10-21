/** Negative fixture: AI/provider message variable */
export function GoodProviderMessage() {
  const message = { content: 'Assistant response body' };
  return <p>{message.content}</p>;
}
