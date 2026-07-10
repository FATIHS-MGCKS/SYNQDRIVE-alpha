/**
 * Conservative token estimate for Mistral models without a tokenizer dependency.
 * Uses ~3.5 characters per token (German + numbers + punctuation skew higher).
 */
export function estimateMistralTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}
