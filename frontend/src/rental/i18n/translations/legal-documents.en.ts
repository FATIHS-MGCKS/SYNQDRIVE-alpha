/**
 * Customer legal documents (Administration → Legal texts) — English copy.
 * Spread into en.ts; de counterpart in legal-documents.de.ts.
 */
export const legalDocumentsEn = {
  'legalDocuments.disclaimer':
    'SynqDrive applies organization-approved legal text rules administratively. It does not provide legal review or legal advice.',

  'legalDocuments.page.eyebrow': 'Administration',
  'legalDocuments.page.title': 'Customer legal texts',
  'legalDocuments.page.description':
    'Manage approved contract and privacy texts for bookings and customer processes.',
  'legalDocuments.page.newVersion': 'New version',
  'legalDocuments.page.refresh': 'Refresh',
  'legalDocuments.page.loadError': 'Could not load legal texts',
  'legalDocuments.page.orgUnavailable': 'Organization unavailable',
  'legalDocuments.page.orgUnavailableDetail':
    'Legal texts cannot be loaded without an organization context.',
  'legalDocuments.page.auditHint': 'Audit note: {message}',

  'legalDocuments.status.DRAFT': 'Draft',
  'legalDocuments.status.IN_REVIEW': 'In review',
  'legalDocuments.status.APPROVED': 'Approved',
  'legalDocuments.status.SCHEDULED': 'Scheduled activation',
  'legalDocuments.status.ACTIVE': 'Active',
  'legalDocuments.status.SUPERSEDED': 'Superseded',
  'legalDocuments.status.REVOKED': 'Revoked',
  'legalDocuments.status.ARCHIVED': 'Archived',

  'legalDocuments.readiness.overall.ready': 'Ready',
  'legalDocuments.readiness.overall.readyDetail':
    'All required categories are approved for bookings.',
  'legalDocuments.readiness.overall.critical': 'Not ready',
  'legalDocuments.readiness.overall.criticalDetail':
    '{count} categories block complete booking documents.',
  'legalDocuments.readiness.overall.attention': 'Partially limited',
  'legalDocuments.readiness.overall.attentionDetail':
    '{count} categories have open notices — bookings may be limited.',

  'legalDocuments.readiness.category.notProvided': 'Not on file',
  'legalDocuments.readiness.category.notReady': 'Not ready',
  'legalDocuments.readiness.category.blocked': 'Blocked',
  'legalDocuments.readiness.category.limited': 'Limited',
  'legalDocuments.readiness.category.ready': 'Ready',

  'legalDocuments.readiness.issue.noVersion': 'No version on file',
  'legalDocuments.readiness.issue.noActive': 'No active version for bookings',
  'legalDocuments.readiness.issue.scanBlocking': 'Malware scan: {status}',
  'legalDocuments.readiness.issue.scanPending': 'Scan pending: {status}',
  'legalDocuments.readiness.issue.integrityBlocking': 'Integrity: {status}',
  'legalDocuments.readiness.issue.integrityUnverified': 'Integrity not yet verified',
  'legalDocuments.readiness.issue.languageMismatch':
    'Active language: {actual} (expected: {expected})',
  'legalDocuments.readiness.issue.jurisdictionMismatch':
    'Jurisdiction: {actual} (expected: {expected})',

  'legalDocuments.readiness.next.uploadAndApprove': 'Upload PDF and approve',
  'legalDocuments.readiness.next.reviewAndActivate': 'Review draft and activate',
  'legalDocuments.readiness.next.activateApproved': 'Activate approved version',
  'legalDocuments.readiness.next.uploadAndActivate': 'Upload version and activate',
  'legalDocuments.readiness.next.fixScanIntegrity': 'Resolve scan or integrity issue',
  'legalDocuments.readiness.next.review': 'Review',

  'legalDocuments.readiness.missingLanguage':
    'No active version for language {language}',

  'legalDocuments.readiness.strip.overall': 'Overall status',
  'legalDocuments.readiness.strip.ready': 'Ready',
  'legalDocuments.readiness.strip.limited': 'Limited',
  'legalDocuments.readiness.strip.limitedHintOpen': 'Open review notices',
  'legalDocuments.readiness.strip.limitedHintNone': 'No open notices',
  'legalDocuments.readiness.strip.blocked': 'Blocked / missing',
  'legalDocuments.readiness.strip.blockedHint': 'Booking documents incomplete',
  'legalDocuments.readiness.strip.blockedHintNone': 'No blocked categories',

  'legalDocuments.categories.title': 'Document categories',
  'legalDocuments.categories.description':
    'Required legal texts for booking and customer processes',
  'legalDocuments.categories.loading': 'Loading document categories',
  'legalDocuments.categories.activeVersion': 'Active version',
  'legalDocuments.categories.validSince': 'Valid since',
  'legalDocuments.categories.approvedBy': 'Approved by',
  'legalDocuments.categories.languageJurisdiction': 'Language / jurisdiction',
  'legalDocuments.categories.variant': 'Variant',
  'legalDocuments.categories.noActive':
    'No active version — booking attachments for this category are missing.',
  'legalDocuments.categories.nextStep': 'Next step: {action}',
  'legalDocuments.categories.inReview': '{count} in review',
  'legalDocuments.categories.drafts': '{count} draft',
  'legalDocuments.categories.showHistory': '{title} — show version history',

  'legalDocuments.alerts.title': 'Critical configuration notices',
  'legalDocuments.alerts.description':
    'Prioritized actions before approval or booking operations',
  'legalDocuments.alerts.severity.critical': 'Critical',
  'legalDocuments.alerts.severity.warning': 'Notice',
  'legalDocuments.alerts.severity.info': 'Info',
  'legalDocuments.alerts.actionRequired': 'Action required',
  'legalDocuments.alerts.reviewRecommended': 'Review recommended',
  'legalDocuments.alerts.checkCategory': 'Check details in the category',

  'legalDocuments.type.TERMS_AND_CONDITIONS.title': 'Terms and conditions (T&Cs)',
  'legalDocuments.type.TERMS_AND_CONDITIONS.hint':
    'When active, included in booking documents and referenced in rental contracts.',

  'legalDocuments.type.CONSUMER_INFORMATION.title': 'Consumer information',
  'legalDocuments.type.CONSUMER_INFORMATION.hint':
    'Organization-approved consumer information — select the variant that matches your process (not legal advice from SynqDrive).',

  'legalDocuments.type.PRIVACY_POLICY.title': 'Privacy policy',
  'legalDocuments.type.PRIVACY_POLICY.hint':
    'When active, made available to customers during booking and may be sent by email.',

  'legalDocuments.variant.WITHDRAWAL_RIGHT_NOTICE': 'Withdrawal notice (where applicable)',
  'legalDocuments.variant.NO_WITHDRAWAL_RIGHT_NOTICE': 'No statutory withdrawal right (where applicable)',
  'legalDocuments.variant.OTHER_CONSUMER_INFORMATION': 'Other consumer information',

  'legalDocuments.wizard.title': 'New legal text version',
  'legalDocuments.wizard.description':
    'Multi-step upload — activation happens separately after approval.',
  'legalDocuments.wizard.step.classification': 'Classification',
  'legalDocuments.wizard.step.version': 'Version & validity',
  'legalDocuments.wizard.step.file': 'File',
  'legalDocuments.wizard.step.review': 'Review',
  'legalDocuments.wizard.stepProgress': 'Step {current} of {total}',
  'legalDocuments.wizard.stepProgressAria': 'Upload progress: step {current} of {total}',
  'legalDocuments.wizard.cancel': 'Cancel',
  'legalDocuments.wizard.back': 'Back',
  'legalDocuments.wizard.next': 'Continue',
  'legalDocuments.wizard.saveDraft': 'Save as draft',
  'legalDocuments.wizard.requestReview': 'Request review',
  'legalDocuments.wizard.abortTitle': 'Cancel upload?',
  'legalDocuments.wizard.abortUploading':
    'The upload in progress will be cancelled. Any draft already saved remains as a draft.',
  'legalDocuments.wizard.abortDirty': 'Unsaved input will be lost.',
  'legalDocuments.wizard.abortConfirm': 'Cancel',
  'legalDocuments.wizard.abortContinue': 'Keep editing',
  'legalDocuments.wizard.draftSaved': 'Draft saved.',
  'legalDocuments.wizard.reviewRequested': 'Review requested.',
  'legalDocuments.wizard.uploadProgress': 'Upload in progress…',
  'legalDocuments.wizard.uploadPercent': '{percent}%',
  'legalDocuments.wizard.uploadLive': 'Upload in progress: {percent} percent',
  'legalDocuments.wizard.uploadComplete': 'Upload complete',
  'legalDocuments.wizard.errorSummary': 'Please correct the highlighted fields:',
  'legalDocuments.wizard.reviewNote':
    'New bookings receive this version after approval and activation — not when saving as a draft.',

  'legalDocuments.wizard.field.documentType': 'Document type',
  'legalDocuments.wizard.field.variant': 'Document variant',
  'legalDocuments.wizard.field.language': 'Language',
  'legalDocuments.wizard.field.jurisdiction': 'Jurisdiction',
  'legalDocuments.wizard.field.customerSegment': 'B2B / B2C',
  'legalDocuments.wizard.field.bookingChannel': 'Booking channel',
  'legalDocuments.wizard.field.stationScope': 'Scope',
  'legalDocuments.wizard.field.productScope': 'Product area',
  'legalDocuments.wizard.field.stations': 'Stations',
  'legalDocuments.wizard.field.mandatory': 'Required document for bookings',
  'legalDocuments.wizard.field.versionLabel': 'Version label',
  'legalDocuments.wizard.field.displayTitle': 'Display title',
  'legalDocuments.wizard.field.validFrom': 'Valid from',
  'legalDocuments.wizard.field.validUntil': 'Valid until (optional)',
  'legalDocuments.wizard.field.changeSummary': 'Change note',
  'legalDocuments.wizard.field.legalOwner': 'Responsible contact',
  'legalDocuments.wizard.field.fileName': 'File name',
  'legalDocuments.wizard.field.fileSize': 'Size',
  'legalDocuments.wizard.field.clientValidation': 'Client validation',
  'legalDocuments.wizard.field.version': 'Version',
  'legalDocuments.wizard.field.file': 'File',
  'legalDocuments.wizard.field.status': 'Status',
  'legalDocuments.wizard.field.pageCount': 'Pages',
  'legalDocuments.wizard.field.scan': 'Malware scan',
  'legalDocuments.wizard.field.integrity': 'Integrity',
  'legalDocuments.wizard.field.checksum': 'Checksum',

  'legalDocuments.wizard.placeholder.select': 'Please select…',
  'legalDocuments.wizard.placeholder.version': 'e.g. 2026-01',
  'legalDocuments.wizard.placeholder.optional': 'Optional',
  'legalDocuments.wizard.placeholder.changeSummary': 'Brief description of content changes',
  'legalDocuments.wizard.placeholder.legalOwner': 'Name of responsible contact',

  'legalDocuments.wizard.file.dropTitle': 'Drop PDF here',
  'legalDocuments.wizard.file.dropHint': 'or choose a file',
  'legalDocuments.wizard.file.choose': 'Choose file',
  'legalDocuments.wizard.file.clientOk': 'PDF format checked (server validates on upload)',

  'legalDocuments.wizard.review.permissionHint':
    'Requesting review requires the “submit for review” permission.',

  'legalDocuments.validation.documentTypeRequired': 'Document type is required.',
  'legalDocuments.validation.variantRequired': 'Document variant is required.',
  'legalDocuments.validation.languageRequired': 'Language is required.',
  'legalDocuments.validation.jurisdictionRequired': 'Jurisdiction is required.',
  'legalDocuments.validation.customerSegmentRequired': 'Customer segment is required.',
  'legalDocuments.validation.bookingChannelRequired': 'Booking channel is required.',
  'legalDocuments.validation.stationScopeRequired': 'Scope is required.',
  'legalDocuments.validation.stationIdsRequired': 'Select at least one station.',
  'legalDocuments.validation.versionLabelRequired': 'Version label is required.',
  'legalDocuments.validation.versionLabelFormat':
    'Letters, numbers, dot, hyphen, and spaces only (max. 64 characters).',
  'legalDocuments.validation.versionLabelDuplicate':
    'This version label already exists for the selected document type.',
  'legalDocuments.validation.validUntilAfterFrom': '“Valid until” must be after “Valid from”.',
  'legalDocuments.validation.fileRequired': 'PDF file is required.',
  'legalDocuments.validation.filePdfOnly':
    'Only PDF files are allowed (including iOS file picker without MIME type).',
  'legalDocuments.validation.fileTooLarge': 'File exceeds {maxMb} MB.',
  'legalDocuments.validation.reasonRequired': 'Reason is required.',
  'legalDocuments.validation.reasonMinLength': 'At least {min} characters required.',
  'legalDocuments.validation.validFromRequired': 'Valid-from date is required.',
  'legalDocuments.validation.validFromInvalid': 'Invalid date.',
  'legalDocuments.validation.validFromFuture': 'Valid-from must be in the future.',

  'legalDocuments.option.language.de': 'German (de)',
  'legalDocuments.option.language.en': 'English (en)',
  'legalDocuments.option.language.fr': 'French (fr)',
  'legalDocuments.option.jurisdiction.DE': 'Germany (DE)',
  'legalDocuments.option.jurisdiction.AT': 'Austria (AT)',
  'legalDocuments.option.jurisdiction.CH': 'Switzerland (CH)',
  'legalDocuments.option.segment.BOTH': 'B2B & B2C',
  'legalDocuments.option.segment.B2C': 'B2C — consumers',
  'legalDocuments.option.segment.B2B': 'B2B — business customers',
  'legalDocuments.option.channel.ALL': 'All channels',
  'legalDocuments.option.channel.WEBSITE': 'Website',
  'legalDocuments.option.channel.OPERATOR_APP': 'Operator app',
  'legalDocuments.option.channel.MANUAL': 'Manual booking',
  'legalDocuments.option.channel.API': 'API',
  'legalDocuments.option.stationScope.ORGANIZATION_WIDE': 'Organization-wide',
  'legalDocuments.option.stationScope.STATION_SPECIFIC': 'Station-specific',
  'legalDocuments.option.productScope.all': 'All product areas',
  'legalDocuments.option.productScope.RENTAL': 'Rental',
  'legalDocuments.option.productScope.FLEET': 'Fleet',
  'legalDocuments.option.productScope.TAXI': 'Taxi',
  'legalDocuments.option.productScope.LOGISTICS': 'Logistics',
  'legalDocuments.option.productScope.OTHER': 'Other',

  'legalDocuments.lifecycle.action.submit_review.title': 'Request review',
  'legalDocuments.lifecycle.action.submit_review.description':
    'The version is submitted for review. It becomes binding for new bookings only after approval and activation.',
  'legalDocuments.lifecycle.action.submit_review.confirm': 'Request review',

  'legalDocuments.lifecycle.action.request_changes.title': 'Request changes',
  'legalDocuments.lifecycle.action.request_changes.description':
    'The version returns to draft status. The uploader can adjust content and resubmit.',
  'legalDocuments.lifecycle.action.request_changes.confirm': 'Return to draft',

  'legalDocuments.lifecycle.action.approve.title': 'Approve version',
  'legalDocuments.lifecycle.action.approve.description':
    'After approval, the version can be activated immediately or on a scheduled date.',
  'legalDocuments.lifecycle.action.approve.confirm': 'Approve',

  'legalDocuments.lifecycle.action.schedule_activation.title': 'Schedule activation',
  'legalDocuments.lifecycle.action.schedule_activation.description':
    'The version is scheduled for the selected start date. Until then, the current active version applies to new bookings.',
  'legalDocuments.lifecycle.action.schedule_activation.confirm': 'Schedule activation',

  'legalDocuments.lifecycle.action.activate_now.title': 'Activate now',
  'legalDocuments.lifecycle.action.activate_now.description':
    'The version becomes binding for new bookings immediately. Existing bookings are unchanged.',
  'legalDocuments.lifecycle.action.activate_now.confirm': 'Activate now',

  'legalDocuments.lifecycle.action.replace_active.title': 'Replace active version',
  'legalDocuments.lifecycle.action.replace_active.description':
    'The new version becomes active immediately. The previous active version is marked “Superseded” — not a revocation.',
  'legalDocuments.lifecycle.action.replace_active.confirm': 'Replace active version',

  'legalDocuments.lifecycle.action.revoke.title': 'Revoke version',
  'legalDocuments.lifecycle.action.revoke.description':
    'Revocation withdraws the version for new bookings. This is not a normal replacement — use activation for content updates.',
  'legalDocuments.lifecycle.action.revoke.confirm': 'Revoke',

  'legalDocuments.lifecycle.action.archive.title': 'Archive version',
  'legalDocuments.lifecycle.action.archive.description':
    'The version is archived and removed from the operational workflow. Historical snapshots and evidence remain — nothing is deleted.',
  'legalDocuments.lifecycle.action.archive.confirm': 'Archive',

  'legalDocuments.lifecycle.actionLabel.submit_review': 'Request review',
  'legalDocuments.lifecycle.actionLabel.request_changes': 'Request changes',
  'legalDocuments.lifecycle.actionLabel.approve': 'Approve',
  'legalDocuments.lifecycle.actionLabel.schedule_activation': 'Schedule activation',
  'legalDocuments.lifecycle.actionLabel.activate_now': 'Activate now',
  'legalDocuments.lifecycle.actionLabel.replace_active': 'Replace active version',
  'legalDocuments.lifecycle.actionLabel.revoke': 'Revoke',
  'legalDocuments.lifecycle.actionLabel.archive': 'Archive',

  'legalDocuments.lifecycle.disabled.scanFailed': 'Malware scan not passed',
  'legalDocuments.lifecycle.disabled.fourEyesReview':
    'Four-eyes rule: you submitted or uploaded this version',
  'legalDocuments.lifecycle.disabled.fourEyesUpload':
    'Four-eyes rule: you uploaded this version',

  'legalDocuments.lifecycle.dialog.statusLine': 'Status: {status} · v{version}',
  'legalDocuments.lifecycle.dialog.close': 'Close',
  'legalDocuments.lifecycle.dialog.cancel': 'Cancel',
  'legalDocuments.lifecycle.dialog.validFromLabel': 'Valid from (scheduled activation) *',
  'legalDocuments.lifecycle.dialog.reasonLabel': 'Reason *',
  'legalDocuments.lifecycle.dialog.reasonPlaceholder':
    'Required reason for audit and traceability',
  'legalDocuments.lifecycle.dialog.changeSummaryLabel': 'Change note (optional)',
  'legalDocuments.lifecycle.dialog.confirmed': 'Action confirmed',
  'legalDocuments.lifecycle.dialog.auditLine': 'Audit: {event} · {time}',
  'legalDocuments.lifecycle.dialog.orgUnavailable': 'Organization unavailable',
  'legalDocuments.lifecycle.dialog.unknownAction': 'Unknown action',

  'legalDocuments.lifecycle.impact.documentType': 'Document type',
  'legalDocuments.lifecycle.impact.newVersion': 'New version',
  'legalDocuments.lifecycle.impact.previousActive': 'Previous active version',
  'legalDocuments.lifecycle.impact.noActive': 'No active version',
  'legalDocuments.lifecycle.impact.validFrom': 'Valid from',
  'legalDocuments.lifecycle.impact.validFromOnSchedule': '(set when scheduling)',
  'legalDocuments.lifecycle.impact.validFromOnActivate': 'On activation (immediate)',
  'legalDocuments.lifecycle.impact.language': 'Language',
  'legalDocuments.lifecycle.impact.jurisdiction': 'Jurisdiction',
  'legalDocuments.lifecycle.impact.channel': 'Channel',
  'legalDocuments.lifecycle.impact.customerSegment': 'Customer segment',
  'legalDocuments.lifecycle.impact.existingBookings': 'Existing bookings',
  'legalDocuments.lifecycle.impact.existingBookingsValue': 'Unchanged (bound snapshots)',
  'legalDocuments.lifecycle.impact.newBookings': 'New bookings',
  'legalDocuments.lifecycle.impact.newBookings.revoke':
    'No longer receive this version — revocation applies forward',
  'legalDocuments.lifecycle.impact.newBookings.archive':
    'Unchanged — archiving affects workflow only',
  'legalDocuments.lifecycle.impact.newBookings.pending':
    'No change yet — only after activation',
  'legalDocuments.lifecycle.impact.newBookings.afterActivation':
    'Use the new version after activation',

  'legalDocuments.lifecycle.notice.revoke':
    'Revocation differs from replacement: existing contracts stay bound; new bookings no longer receive this version.',
  'legalDocuments.lifecycle.notice.replace':
    'The previous active version is marked “Superseded” — not a revocation or deletion.',
  'legalDocuments.lifecycle.notice.archive':
    'Archived versions remain visible in snapshots and evidence. No files are deleted.',
  'legalDocuments.lifecycle.notice.fourEyes':
    'Four-eyes rule is active: approval and activation must not be done by the same person who uploaded or submitted for review.',
  'legalDocuments.lifecycle.notice.fourEyesBlocked': ' You are blocked for this action.',

  'legalDocuments.lifecycle.event.SUBMITTED_FOR_REVIEW': 'Review requested',
  'legalDocuments.lifecycle.event.APPROVED': 'Approved',
  'legalDocuments.lifecycle.event.SCHEDULED': 'Activation scheduled',
  'legalDocuments.lifecycle.event.ACTIVATED': 'Activated',
  'legalDocuments.lifecycle.event.SUPERSEDED': 'Superseded',
  'legalDocuments.lifecycle.event.REVOKED': 'Revoked',
  'legalDocuments.lifecycle.event.ARCHIVED': 'Archived',
  'legalDocuments.lifecycle.event.RETURNED_TO_DRAFT': 'Changes requested',
  'legalDocuments.lifecycle.event.UPLOADED': 'Uploaded',
  'legalDocuments.lifecycle.event.SUBMITTED_FOR_REVIEW_DETAIL': 'Submitted for review',
  'legalDocuments.lifecycle.event.LEGAL_HOLD_SET': 'Legal hold set',
  'legalDocuments.lifecycle.event.LEGAL_HOLD_CLEARED': 'Legal hold cleared',
  'legalDocuments.lifecycle.event.STORAGE_PURGED': 'File purged (retention)',
  'legalDocuments.lifecycle.event.STORAGE_PURGE_FAILED': 'Purge failed',
  'legalDocuments.lifecycle.event.RECIPIENT_REDACTED': 'Recipient data redacted',

  'legalDocuments.lifecycle.conflict.ACTIVE_CONFLICT':
    'Another version was activated in parallel. Data was refreshed — please check the current status.',
  'legalDocuments.lifecycle.conflict.SCOPE_CONFLICT':
    'Scope overlaps with an already active version. Adjust scope or version.',
  'legalDocuments.lifecycle.conflict.FOUR_EYES_VIOLATION':
    'Four-eyes rule: approval or activation by the same user who uploaded or submitted for review is not allowed.',
  'legalDocuments.lifecycle.conflict.INVALID_STATUS_TRANSITION':
    'Status changed in the meantime. Please reload the list.',
  'legalDocuments.lifecycle.conflict.NOT_ACTIVATABLE':
    'This version cannot be activated in its current status.',
  'legalDocuments.lifecycle.conflict.SCAN_NOT_PASSED':
    'Malware scan not passed — activation or review is blocked.',

  'legalDocuments.history.title': 'Version history',
  'legalDocuments.history.description':
    'Server-paginated history per document type with filters and detail view',
  'legalDocuments.history.collapse': 'Collapse',
  'legalDocuments.history.expand': 'Expand',
  'legalDocuments.history.filter.language': 'Language',
  'legalDocuments.history.filter.status': 'Status',
  'legalDocuments.history.filter.jurisdiction': 'Jurisdiction',
  'legalDocuments.history.filter.from': 'Created from',
  'legalDocuments.history.filter.to': 'Created until',
  'legalDocuments.history.filter.all': 'All',
  'legalDocuments.history.filter.allLanguages': 'All languages',
  'legalDocuments.history.filter.allStatuses': 'All statuses',
  'legalDocuments.history.filter.allJurisdictions': 'All jurisdictions',
  'legalDocuments.history.filter.reset': 'Reset filters',
  'legalDocuments.history.column.version': 'Version',
  'legalDocuments.history.column.language': 'Language',
  'legalDocuments.history.column.jurisdiction': 'Jurisdiction',
  'legalDocuments.history.column.status': 'Status',
  'legalDocuments.history.column.validity': 'Validity',
  'legalDocuments.history.column.approved': 'Approved',
  'legalDocuments.history.column.activated': 'Activated',
  'legalDocuments.history.column.checksum': 'Checksum',
  'legalDocuments.history.column.scanIntegrity': 'Scan / integrity',
  'legalDocuments.history.column.usage': 'Usage',
  'legalDocuments.history.validUntil': 'until {date}',
  'legalDocuments.history.empty': 'No versions for this document type yet',
  'legalDocuments.history.emptyFiltered': 'No versions match the selected filters',
  'legalDocuments.history.loadError': 'Could not load versions',
  'legalDocuments.history.actions': 'Actions',
  'legalDocuments.history.pagination':
    '{total} versions · page {page} of {totalPages}',
  'legalDocuments.history.paginationSingle':
    '{total} version · page {page} of {totalPages}',
  'legalDocuments.history.prevPage': 'Previous page',
  'legalDocuments.history.nextPage': 'Next page',

  'legalDocuments.detail.eyebrow': 'Legal text',
  'legalDocuments.detail.title': 'Version {version}',
  'legalDocuments.detail.download': 'Download PDF',
  'legalDocuments.detail.loading': 'Loading details…',
  'legalDocuments.detail.noneSelected': 'No version selected.',
  'legalDocuments.detail.metadata': 'Metadata',
  'legalDocuments.detail.lifecycle': 'Lifecycle',
  'legalDocuments.detail.noLifecycle': 'No lifecycle events yet.',
  'legalDocuments.detail.auditEvents': 'Audit events',
  'legalDocuments.detail.usage': 'Usage',
  'legalDocuments.detail.usage.snapshots': 'Snapshots',
  'legalDocuments.detail.usage.bookings': 'Bookings',
  'legalDocuments.detail.usage.contracts': 'Contracts',
  'legalDocuments.detail.usage.deliveryEvidence': 'Delivery evidence',
  'legalDocuments.detail.usage.deliveryStatus': 'Delivery status: {summary}',
  'legalDocuments.detail.usage.noDelivery': 'No delivery evidence',
  'legalDocuments.detail.usage.noReferences':
    'No usage in bookings or contracts yet.',
  'legalDocuments.detail.usage.unavailable': 'Usage data unavailable.',
  'legalDocuments.detail.usage.contractRef': 'Contract {number}',
  'legalDocuments.detail.usage.generatedDoc': 'Generated document',
  'legalDocuments.detail.preview': 'PDF preview',
  'legalDocuments.detail.previewLoading': 'Loading preview…',
  'legalDocuments.detail.previewUnavailable':
    'Preview unavailable. Download may require permission.',
  'legalDocuments.detail.pages': 'Pages',
  'legalDocuments.detail.changes': 'Changes',
  'legalDocuments.detail.responsible': 'Responsible',
  'legalDocuments.detail.loadError': 'Could not load details',

  'legalDocuments.audit.title': 'Audit & usage',
  'legalDocuments.audit.description': 'Recent lifecycle events and approvals (read-only)',
  'legalDocuments.audit.empty': 'No audit entries yet.',
  'legalDocuments.audit.loadError': 'Could not load audit events',
  'legalDocuments.audit.system': 'System',

  'legalDocuments.scan.UPLOADED': 'Uploaded',
  'legalDocuments.scan.PENDING': 'Pending',
  'legalDocuments.scan.SCANNING': 'Scanning',
  'legalDocuments.scan.SCAN_PASSED': 'OK',
  'legalDocuments.scan.FAILED': 'Failed',
  'legalDocuments.scan.INFECTED': 'Infected',
  'legalDocuments.scan.REJECTED': 'Rejected',
  'legalDocuments.scan.QUARANTINED': 'Quarantined',
  'legalDocuments.scan.SCAN_FAILED': 'Scan failed',

  'legalDocuments.integrity.UNVERIFIED': 'Unverified',
  'legalDocuments.integrity.VERIFIED': 'Verified',
  'legalDocuments.integrity.CHECKSUM_MISMATCH': 'Checksum mismatch',
  'legalDocuments.integrity.MISSING_OBJECT': 'File missing',
  'legalDocuments.integrity.STORAGE_ERROR': 'Storage error',
  'legalDocuments.integrity.INTEGRITY_FAILED': 'Integrity failed',

  'legalDocuments.tooltip.checksum':
    'Cryptographic fingerprint of the stored PDF. Used to detect file changes.',
  'legalDocuments.tooltip.integrity':
    'Checks whether the stored file still matches its checksum and is readable.',
  'legalDocuments.tooltip.snapshot':
    'Immutable copy of the legal text bound to a booking or contract at generation time.',
  'legalDocuments.tooltip.scan':
    'Malware scan status of the uploaded PDF before approval or activation.',

  'legalDocuments.toast.checksumCopied': 'Checksum copied',
  'legalDocuments.toast.copyFailed': 'Copy failed',
  'legalDocuments.toast.actionFallback': 'Action',
  'legalDocuments.toast.actionSuccess': '{action} — {event}',
  'legalDocuments.toast.actionStatus': '{action} — Status: {status}',

  'legalDocuments.scanError.failed':
    'Malware scan failed — draft was not approved for activation.',
  'legalDocuments.scanError.status': 'Malware scan status: {status}',

  'legalDocuments.error.unknown': 'Unknown error',
  'legalDocuments.error.api': 'API error {status}',

  'legalDocuments.a11y.pdfPreview': 'PDF preview of legal text',
  'legalDocuments.a11y.showDetail': 'Show details for version {version}',
  'legalDocuments.a11y.downloadVersion': 'Download version {version}',
  'legalDocuments.a11y.lifecycleActions': 'Lifecycle actions for version {version}',
  'legalDocuments.a11y.copyChecksum': 'Copy checksum',

  'legalDocuments.common.emDash': '—',
  'legalDocuments.common.until': '–',
} as const;

export type LegalDocumentsTranslationKey = keyof typeof legalDocumentsEn;
