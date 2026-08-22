export const operatorDamageCaptureDe = {
  'operator.damageCapture.title': 'Schaden erfassen',
  'operator.damageCapture.steps.vehicle': 'Fahrzeug',
  'operator.damageCapture.steps.photos': 'Fotos',
  'operator.damageCapture.steps.details': 'Klassifizierung',
  'operator.damageCapture.steps.review': 'Prüfen',

  'operator.damageCapture.vehicle.confirmHint': 'Fahrzeug für die Schadenerfassung bestätigen.',
  'operator.damageCapture.field.vehicle': 'Fahrzeug',
  'operator.damageCapture.field.plate': 'Kennzeichen',
  'operator.damageCapture.field.booking': 'Buchung',
  'operator.damageCapture.field.customer': 'Kunde',
  'operator.damageCapture.field.source': 'Quelle',
  'operator.damageCapture.field.type': 'Typ',
  'operator.damageCapture.field.severity': 'Schweregrad',
  'operator.damageCapture.field.location': 'Position',
  'operator.damageCapture.field.rentalImpact': 'Vermietung',
  'operator.damageCapture.field.description': 'Beschreibung',
  'operator.damageCapture.field.photos': 'Fotos',

  'operator.damageCapture.actions.continue': 'Weiter',
  'operator.damageCapture.actions.save': 'Schaden speichern',

  'operator.damageCapture.photos.hint':
    'Schadenfotos aufnehmen oder aus der Galerie wählen. Mehrere Bilder sind möglich.',
  'operator.damageCapture.photos.camera': 'Kamera',
  'operator.damageCapture.photos.gallery': 'Galerie',
  'operator.damageCapture.photos.alt': 'Schadenfoto',
  'operator.damageCapture.photos.removeAria': 'Foto entfernen',
  'operator.damageCapture.photos.count':
    '{count}/{max} Fotos · Große Bilder werden vor dem Upload komprimiert.',
  'operator.damageCapture.photos.errorProcess': 'Foto konnte nicht verarbeitet werden.',

  'operator.damageCapture.details.damageType': 'Schadenstyp',
  'operator.damageCapture.details.severity': 'Schweregrad',
  'operator.damageCapture.details.location': 'Position',
  'operator.damageCapture.details.locationPlaceholder': 'Position genauer beschreiben (optional)',
  'operator.damageCapture.details.description': 'Beschreibung',
  'operator.damageCapture.details.descriptionPlaceholder': 'Was ist passiert? Sichtbare Details…',
  'operator.damageCapture.details.rentalImpact': 'Vermietungsauswirkung',

  'operator.damageCapture.review.previewAlt': 'Vorschau',
  'operator.damageCapture.aiUpload.title': 'Schadensbeleg per AI Upload',
  'operator.damageCapture.aiUpload.hint':
    'Optional — Schadensbericht per AI extrahieren (nach Speichern mit damageId verknüpfbar)',

  'operator.damageCapture.validation.photosRequired': 'Mindestens ein Foto aufnehmen oder hochladen.',
  'operator.damageCapture.validation.damageTypeRequired': 'Schadenstyp wählen.',
  'operator.damageCapture.validation.severityRequired': 'Schweregrad wählen.',
  'operator.damageCapture.validation.descriptionMax': 'Beschreibung max. {max} Zeichen.',

  'operator.damageCapture.error.saveFailed': 'Schaden konnte nicht gespeichert werden.',

  'operator.damageCapture.damageType.SCRATCH': 'Kratzer',
  'operator.damageCapture.damageType.DENT': 'Delle',
  'operator.damageCapture.damageType.CRACK': 'Riss',
  'operator.damageCapture.damageType.BROKEN_PART': 'Defektes Teil',
  'operator.damageCapture.damageType.PAINT_DAMAGE': 'Lackschaden',
  'operator.damageCapture.damageType.GLASS_DAMAGE': 'Glasschaden',
  'operator.damageCapture.damageType.TIRE_DAMAGE': 'Reifenschaden',
  'operator.damageCapture.damageType.INTERIOR_DAMAGE': 'Innenraumschaden',
  'operator.damageCapture.damageType.OTHER': 'Sonstiges',

  'operator.damageCapture.severity.MINOR': 'Gering',
  'operator.damageCapture.severity.MODERATE': 'Mittel',
  'operator.damageCapture.severity.MAJOR': 'Schwer',
  'operator.damageCapture.severity.CRITICAL': 'Kritisch',

  'operator.damageCapture.rentalImpact.NONE': 'Kein Einfluss',
  'operator.damageCapture.rentalImpact.WATCH': 'Beobachten',
  'operator.damageCapture.rentalImpact.BLOCK_RENTAL': 'Vermietung blockiert',
  'operator.damageCapture.rentalImpact.SAFETY_CRITICAL': 'Sicherheitskritisch',

  'operator.damageCapture.location.front': 'Front',
  'operator.damageCapture.location.rear': 'Heck',
  'operator.damageCapture.location.left': 'Links',
  'operator.damageCapture.location.right': 'Rechts',
  'operator.damageCapture.location.roof': 'Dach',
  'operator.damageCapture.location.interior': 'Innenraum',
  'operator.damageCapture.location.tire': 'Reifen/Felge',

  'operator.damageCapture.source.PICKUP_HANDOVER': 'Übergabe Abholung',
  'operator.damageCapture.source.RETURN_HANDOVER': 'Übergabe Rückgabe',
  'operator.damageCapture.source.AI_UPLOAD': 'AI-Upload',
  'operator.damageCapture.source.MANUAL': 'Manuell',
  'operator.damageCapture.source.WORKSHOP': 'Werkstatt',
  'operator.damageCapture.source.INSPECTION': 'Inspektion',
} as const;
