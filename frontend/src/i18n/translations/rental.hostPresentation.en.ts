export const rentalHostPresentationEn = {
  'rental.shell.cleaning.toast.taskCreated': 'Cleaning task created',
  'rental.shell.cleaning.toast.taskCreatedDescription':
    'The task appears in this vehicle’s Tasks tab.',
  'rental.shell.cleaning.toast.duplicateTask': 'Open cleaning task already exists',
  'rental.shell.cleaning.toast.duplicateTaskDescription': 'No duplicate task was created.',
  'rental.shell.cleaning.toast.statusSavedWarning': 'Cleaning status saved',
  'rental.shell.cleaning.toast.taskCreateFailedDescription': 'The cleaning task could not be created.',
  'rental.shell.cleaning.toast.taskCompleted': 'Cleaning task completed',
  'rental.shell.cleaning.toast.taskCompletedSingleDescription': 'Vehicle marked as clean.',
  'rental.shell.cleaning.toast.taskCompletedMultipleDescription':
    '{count} open cleaning tasks were completed.',
  'rental.shell.cleaning.toast.vehicleMarkedClean': 'Vehicle marked as clean',
  'rental.shell.cleaning.toast.statusSaveFailed': 'Could not save cleaning status',
  'rental.shell.toast.vehicleOpenFailed': 'Could not open vehicle.',

  'bookings.toast.saved': 'Booking saved',
  'bookings.toast.noSavableChanges': 'No savable changes',
  'bookings.toast.saveFailed': 'Could not save booking',
  'bookings.toast.updated': 'Booking updated',
  'bookings.toast.cancelFailed': 'Could not cancel booking',
  'bookings.toast.noShowFailed': 'Could not mark as no-show',
  'bookings.dossier.toast.finalInvoiceHint':
    'Create the final invoice in the Payments & Documents tab.',
  'bookings.dossier.toast.manualPaymentHint':
    'Record manual payment in the invoice view.',
  'bookings.edit.toast.noChanges': 'No changes to save',

  'newBooking.toast.incomplete': 'Booking incomplete',
  'newBooking.toast.requiredFieldsDescription':
    'Vehicle, customer, pickup and return dates are required.',
  'newBooking.toast.diditPrepFailed': 'Didit preparation failed',
  'newBooking.toast.priceUnavailable': 'Price unavailable',
  'newBooking.toast.stationsRequiredDescription': 'Please select pickup and return stations.',
  'newBooking.toast.stationsMissing': 'Stations missing',
  'newBooking.toast.waitEligibilityDescription':
    'Please wait until the server-side clearance check is complete.',
  'newBooking.toast.documentsPreparing': 'Preparing documents',
  'newBooking.toast.eligibilityRunning': 'Eligibility check in progress',
  'newBooking.toast.vehicleNotRentable': 'Vehicle not rentable',
  'newBooking.toast.healthCheckUnavailable': 'Health check unavailable',
  'newBooking.toast.customerNotCleared': 'Customer not cleared',
  'newBooking.toast.priceStale': 'Price outdated',
  'newBooking.toast.saveFailed': 'Could not save',

  'customers.toast.diditPrepFailed': 'Didit preparation failed',
  'customers.toast.diditWindow': 'Didit opens in a new window…',
  'customers.toast.noteSaved': 'Note saved',
  'customers.toast.statusSaveFailed': 'Could not save status',
  'customers.error.documentStatusLoad': 'Could not load document status',
  'customers.error.documentsLoad': 'Could not load documents',
  'customers.error.timelineLoad': 'Could not load timeline',
  'customers.error.finesLoad': 'Could not load fines',
  'customers.error.invoicesLoad': 'Could not load invoices',

  'rental.vehicleHealth.aria.dataQuality': 'Data quality',
  'rental.vehicleHealth.aria.safety': 'Safety',
  'rental.telltale.error.contextLoadFailed':
    'Booking and trip context could not be loaded.',

  'rental.service.toast.cannotComplete': 'Cannot complete',
  'rental.service.toast.taskCompleted': 'Task completed',

  'rental.vehicleAssignments.toast.updated': 'Vehicle assignment updated',
  'rental.vehicleAssignments.toast.categoryAssigned': 'Category assigned',
  'rental.vehicleAssignments.toast.overridesCleared': 'Overrides cleared — using inherited rules',
  'rental.vehicleAssignments.toast.overridesSaved': 'Vehicle overrides saved',

  'rental.vehicleBookings.error.loadFailed': 'Could not load bookings for this vehicle.',
  'rental.vehicleTasks.error.loadFailed': 'Could not load tasks for this vehicle.',
} as const;
