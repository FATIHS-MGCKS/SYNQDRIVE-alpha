export interface DataProcessingPermissions {
  canViewHub: boolean;
  canViewActivities: boolean;
  canViewEnforcement: boolean;
  canViewProviders: boolean;
  canViewConsents: boolean;
  canViewPartners: boolean;
  canViewAudit: boolean;
  canCreateAny: boolean;
  canCreateInternal: boolean;
  canCreateProvider: boolean;
  canCreatePartnerSharing: boolean;
  canCreateConsent: boolean;
  canCreateProcessor: boolean;
  canRequestReview: boolean;
  visibleSections: Array<'activities' | 'enforcement' | 'providers' | 'consents' | 'partners' | 'audit'>;
}

type PermissionCheck = (module: string, level: 'read' | 'write' | 'manage') => boolean;

export function buildDataProcessingPermissions(hasPermission: PermissionCheck): DataProcessingPermissions {
  const canViewHub = hasPermission('data-authorization', 'read');
  const canViewActivities = canViewHub;
  const canViewEnforcement = canViewHub;
  const canViewProviders = canViewHub;
  const canViewConsents = canViewHub;
  const canViewPartners = canViewHub;
  const canViewAudit = canViewHub;
  const canCreateInternal = hasPermission('data-authorization', 'write');
  const canCreateProvider = hasPermission('data-authorization', 'write');
  const canCreatePartnerSharing = hasPermission('data-authorization', 'write');
  const canCreateConsent = hasPermission('data-authorization', 'write');
  const canCreateProcessor = hasPermission('data-authorization', 'write');
  const canRequestReview = hasPermission('data-authorization', 'manage');
  const canCreateAny =
    canCreateInternal ||
    canCreateProvider ||
    canCreatePartnerSharing ||
    canCreateConsent ||
    canCreateProcessor;

  const visibleSections: DataProcessingPermissions['visibleSections'] = [];
  if (canViewActivities) visibleSections.push('activities');
  if (canViewEnforcement) visibleSections.push('enforcement');
  if (canViewProviders) visibleSections.push('providers');
  if (canViewConsents) visibleSections.push('consents');
  if (canViewPartners) visibleSections.push('partners');
  if (canViewAudit) visibleSections.push('audit');

  return {
    canViewHub,
    canViewActivities,
    canViewEnforcement,
    canViewProviders,
    canViewConsents,
    canViewPartners,
    canViewAudit,
    canCreateAny,
    canCreateInternal,
    canCreateProvider,
    canCreatePartnerSharing,
    canCreateConsent,
    canCreateProcessor,
    canRequestReview,
    visibleSections,
  };
}
