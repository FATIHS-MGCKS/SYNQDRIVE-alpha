export type ProductMetadataPatchPending = {
  productSlug: string;
  body: {
    name: string;
    description: string | null;
    ifCurrentName: string;
    ifCurrentDescription: string | null;
  };
  onSuccess?: () => void | Promise<void>;
};

export function shouldRetainProductMetadataPending(status: number, message: string): boolean {
  return status === 403 && message.includes('STEP_UP_REQUIRED');
}

export function isProductMetadataConflict(status: number, message: string): boolean {
  return status === 409 || message.toLowerCase().includes('concurrently');
}