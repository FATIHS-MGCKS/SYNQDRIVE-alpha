export const masterCvTechnicalSpecsIt = {
  'master.cv.technicalSpecs.sectionTitle': 'Specifiche tecniche del veicolo',
  'master.cv.technicalSpecs.editAction': 'Modifica specifiche',
  'master.cv.technicalSpecs.loading': 'Caricamento specifiche…',
  'master.cv.technicalSpecs.loadError': 'Impossibile caricare le specifiche.',
  'master.cv.technicalSpecs.retry': 'Riprova',
  'master.cv.technicalSpecs.noReference': 'Nessun riferimento',
  'master.cv.technicalSpecs.make': 'Marca',
  'master.cv.technicalSpecs.model': 'Modello',
  'master.cv.technicalSpecs.year': 'Anno modello',
  'master.cv.technicalSpecs.drivetrainType': 'Alimentazione / carburante',
  'master.cv.technicalSpecs.curbWeight': 'Peso a vuoto',
  'master.cv.technicalSpecs.systemPower': 'Potenza motore / sistema',
  'master.cv.technicalSpecs.accel0To100': '0–100 km/h',
  'master.cv.technicalSpecs.unitKg': 'kg',
  'master.cv.technicalSpecs.unitKw': 'kW',
  'master.cv.technicalSpecs.unitSeconds': 's',
  'master.cv.technicalSpecs.editLoadError': 'Impossibile caricare i dati del veicolo per la modifica.',
  'master.cv.technicalSpecs.updateSuccess': 'Specifiche del veicolo salvate.',
  'master.cv.technicalSpecs.updatePartialSaveFailed':
    'Le specifiche non sono state salvate completamente. Controlla i campi e riprova.',
  'master.cv.technicalSpecs.updatePartialPhysicsFailed':
    'I dati fisici (es. peso a vuoto) non sono stati salvati. Le specifiche HV sono state salvate.',
  'master.cv.technicalSpecs.updatePartialHvFailed':
    'Le specifiche HV non sono state salvate. Altri dati del veicolo potrebbero essere stati salvati.',
  'master.cv.technicalSpecs.secondaryDetails': 'Dettagli operativi e di integrazione',
  'master.cv.technicalSpecs.hvLegacyMasterDataHint':
    'La capacità utile è un dato legacy (non SOH, non riferimento verificato, non misurazione) e resta in sola lettura. I campi HV estesi sotto sono modificabili e salvati separatamente dalla battery health.',
  'master.cv.technicalSpecs.hvFieldNotPersistedHint':
    'I campi HV estesi sono salvati nella master specification HV (separata dalle capacità di riferimento SOH).',
  'master.cv.technicalSpecs.diRoutingSectionTitle': 'Instradamento eventi di guida (DI)',
  'master.cv.technicalSpecs.diRoutingHint':
    'LTE_R1 vs SMART5 definisce come Driving Intelligence acquisisce gli eventi di guida. È separato dalla modalità di connessione onboarding verificata (software/OEM vs telematica fisica).',
  'master.cv.technicalSpecs.connectionModalityLabel': 'Modalità di connessione verificata',
  'master.cv.technicalSpecs.telemetryFamilyLabel': 'Famiglia telemetria',
  'master.cv.technicalSpecs.diRoutingHardwareLabel': 'Classificazione routing DI (memorizzata)',
  'master.cv.technicalSpecs.diRoutingReadOnlyHint':
    'Il routing DI non può essere modificato qui. Modificare la classificazione memorizzata richiede una revisione DI approvata dall’operatore.',
  'master.cv.technicalSpecs.diRoutingLteR1Info':
    'Routing LTE_R1: gli eventi di guida (frenata brusca, accelerazione, curve) usano il percorso eventi API telemetria DIMO. Non è il tipo di dispositivo fisico a bordo.',
};
