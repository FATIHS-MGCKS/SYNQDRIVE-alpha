export const operatorTireMeasureEn = {
  'operator.tireMeasure.eyebrow': 'Measure tire tread',
  'operator.tireMeasure.stepProgress': 'Step {{current}}/{{total}} — {{step}}',

  'operator.tireMeasure.steps.vehicle': 'Vehicle',
  'operator.tireMeasure.steps.set': 'Tire set',
  'operator.tireMeasure.steps.tread': 'Tread',
  'operator.tireMeasure.steps.context': 'Context',
  'operator.tireMeasure.steps.review': 'Review',

  'operator.tireMeasure.positions.fl.short': 'FL',
  'operator.tireMeasure.positions.fl.long': 'Front left',
  'operator.tireMeasure.positions.fr.short': 'FR',
  'operator.tireMeasure.positions.fr.long': 'Front right',
  'operator.tireMeasure.positions.rl.short': 'RL',
  'operator.tireMeasure.positions.rl.long': 'Rear left',
  'operator.tireMeasure.positions.rr.short': 'RR',
  'operator.tireMeasure.positions.rr.long': 'Rear right',

  'operator.tireMeasure.sources.manual': 'Manual',
  'operator.tireMeasure.sources.workshop': 'Workshop report',
  'operator.tireMeasure.sources.ai_confirmed': 'AI upload / document',

  'operator.tireMeasure.seasons.SUMMER': 'Summer tires',
  'operator.tireMeasure.seasons.WINTER': 'Winter tires',
  'operator.tireMeasure.seasons.ALL_SEASON': 'All-season tires',
  'operator.tireMeasure.seasons.TRACK': 'Track',
  'operator.tireMeasure.seasons.OTHER': 'Other',
  'operator.tireMeasure.seasons.UNKNOWN': 'Unknown',

  'operator.tireMeasure.fields.plate': 'License plate',
  'operator.tireMeasure.fields.vehicle': 'Vehicle',
  'operator.tireMeasure.fields.odometer': 'Odometer',
  'operator.tireMeasure.fields.tireSet': 'Tire set',
  'operator.tireMeasure.fields.measuredAt': 'Measurement date',
  'operator.tireMeasure.fields.odometerKm': 'Odometer',
  'operator.tireMeasure.fields.method': 'Measurement method',
  'operator.tireMeasure.fields.workshop': 'Workshop',
  'operator.tireMeasure.fields.note': 'Note',

  'operator.tireMeasure.placeholders.optional': 'Optional',
  'operator.tireMeasure.placeholders.workshopName': 'Workshop name',
  'operator.tireMeasure.placeholders.note':
    'Optional — review only locally, not sent to tire-health API',

  'operator.tireMeasure.vehicle.lastMeasurement': 'Last measurement:',
  'operator.tireMeasure.vehicle.pipelineHint':
    'The measurement is written as evidence into the canonical tire-health pipeline — no separate calculation in Operator.',

  'operator.tireMeasure.set.hint':
    'Which tire set was measured? The default is the currently mounted set.',

  'operator.tireMeasure.tread.hint':
    'Tread depth in mm — decimals allowed (e.g. 5.8). At least one tire required.',
  'operator.tireMeasure.tread.plausibilityBounds': 'Plausibility: {{min}}–{{max}} mm (backend limits)',
  'operator.tireMeasure.tread.unitMm': 'mm',
  'operator.tireMeasure.tread.ariaLabel': '{{position}} tread depth mm',

  'operator.tireMeasure.context.aiUploadTitle': 'Extract tire report via AI upload',
  'operator.tireMeasure.context.aiUploadHint': 'Apply extracted values only after confirmation',

  'operator.tireMeasure.review.vehicle': 'Vehicle:',
  'operator.tireMeasure.review.tireSet': 'Tire set:',
  'operator.tireMeasure.review.date': 'Date:',
  'operator.tireMeasure.review.km': 'Km:',
  'operator.tireMeasure.review.method': 'Method:',
  'operator.tireMeasure.review.note': 'Note:',
  'operator.tireMeasure.review.uiWarnings': 'Notes (UI only)',
  'operator.tireMeasure.review.backendHint':
    'After saving, tire health / rental health reload — status and remaining km come exclusively from the backend.',
  'operator.tireMeasure.review.now': 'Now',

  'operator.tireMeasure.actions.cancel': 'Cancel',
  'operator.tireMeasure.actions.back': 'Back',
  'operator.tireMeasure.actions.continue': 'Continue',
  'operator.tireMeasure.actions.save': 'Save measurement',

  'operator.tireMeasure.toast.success': 'Tire tread measurement saved',
  'operator.tireMeasure.toast.saveError': 'Could not save',
  'operator.tireMeasure.errors.loadFailed': 'Loading failed',

  'operator.tireMeasure.validation.treadRequired': 'Enter at least one tread depth.',
  'operator.tireMeasure.validation.measuredAtInvalid': 'Measurement date is invalid.',
  'operator.tireMeasure.validation.odometerInvalid': 'Odometer reading is invalid.',

  'operator.tireMeasure.plausibility.range':
    '{{position}}: Value outside {{min}}–{{max}} mm.',
  'operator.tireMeasure.plausibility.legalMin':
    '{{position}}: Near legal minimum tread depth ({{mm}} mm).',
  'operator.tireMeasure.plausibility.low': '{{position}}: Tread very low ({{mm}} mm).',
  'operator.tireMeasure.plausibility.high':
    '{{position}}: Unusually high value ({{mm}} mm) — please verify.',
  'operator.tireMeasure.plausibility.frontAxleDiff':
    'Front axle: Notable FL/FR difference ({{diff}} mm).',
  'operator.tireMeasure.plausibility.rearAxleDiff':
    'Rear axle: Notable RL/RR difference ({{diff}} mm).',

  'operator.tireMeasure.setup.stored': ' (stored)',
  'operator.tireMeasure.setup.mounted': ' (mounted)',
  'operator.tireMeasure.setup.unknownNoSetup': 'Unknown — no tire set on file',

  'operator.tireMeasure.fallback.unknown': 'Unknown',
  'operator.tireMeasure.fallback.active': 'Active',
  'operator.tireMeasure.fallback.vehicle': 'Vehicle',

  'operator.tireMeasure.handover.notePrefix': 'Handover booking {{id}}…',
} as const;
