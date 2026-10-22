export function isPdiInventoryRelationMissingError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const missingRelation =
    message.includes('relation') &&
    message.includes('does not exist') &&
    (message.includes('physical_devices') || message.includes('physical_device_assignments'));

  if (code === '42P01') {
    return (
      message.includes('physical_devices') ||
      message.includes('physical_device_assignments') ||
      missingRelation
    );
  }
  return missingRelation;
}
