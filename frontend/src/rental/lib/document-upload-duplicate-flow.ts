export function isAuthorizedReuploadReason(reason: string): boolean {
  return reason.trim().length >= 3;
}

export function shouldShowBusinessDuplicateWarning(
  uploadDuplicateStatus?: string | null,
): boolean {
  return uploadDuplicateStatus === 'POSSIBLE_BUSINESS_DUPLICATE';
}
