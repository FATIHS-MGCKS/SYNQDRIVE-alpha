export const masterCvTechnicalSpecsEs = {
  'master.cv.technicalSpecs.sectionTitle': 'Especificaciones técnicas del vehículo',
  'master.cv.technicalSpecs.editAction': 'Editar especificaciones',
  'master.cv.technicalSpecs.loading': 'Cargando especificaciones…',
  'master.cv.technicalSpecs.loadError': 'No se pudieron cargar las especificaciones.',
  'master.cv.technicalSpecs.retry': 'Reintentar',
  'master.cv.technicalSpecs.noReference': 'Sin referencia',
  'master.cv.technicalSpecs.make': 'Marca',
  'master.cv.technicalSpecs.model': 'Modelo',
  'master.cv.technicalSpecs.year': 'Año del modelo',
  'master.cv.technicalSpecs.drivetrainType': 'Tren motriz / combustible',
  'master.cv.technicalSpecs.curbWeight': 'Peso en vacío',
  'master.cv.technicalSpecs.systemPower': 'Potencia motor / sistema',
  'master.cv.technicalSpecs.accel0To100': '0–100 km/h',
  'master.cv.technicalSpecs.unitKg': 'kg',
  'master.cv.technicalSpecs.unitKw': 'kW',
  'master.cv.technicalSpecs.unitSeconds': 's',
  'master.cv.technicalSpecs.editLoadError': 'No se pudieron cargar los datos del vehículo para editar.',
  'master.cv.technicalSpecs.updateSuccess': 'Especificaciones del vehículo guardadas.',
  'master.cv.technicalSpecs.updatePartialSaveFailed':
    'No se pudieron guardar todas las especificaciones. Revise los campos e inténtelo de nuevo.',
  'master.cv.technicalSpecs.updatePartialPhysicsFailed':
    'No se guardaron los datos físicos (p. ej. peso en vacío). Las especificaciones HV sí se guardaron.',
  'master.cv.technicalSpecs.updatePartialHvFailed':
    'No se guardaron las especificaciones HV. Otros datos del vehículo pueden haberse guardado.',
  'master.cv.technicalSpecs.secondaryDetails': 'Detalles operativos e de integración',
  'master.cv.technicalSpecs.hvCatalogVariantLabel': 'Variante de catálogo HV (explícita)',
  'master.cv.technicalSpecs.hvCatalogVariantNone': 'Ninguna — sin metadatos de catálogo',
  'master.cv.technicalSpecs.hvCatalogVariantTeslaModel3RwdCatl6l':
    'Tesla Model 3 RWD LFP — catálogo CATL 6L (ESTIMATED, pack no verificado)',
  'master.cv.technicalSpecs.hvLegacyMasterDataHint':
    'La capacidad útil es un dato legacy (no SOH, no referencia verificada, no medición) y permanece solo lectura. Los campos HV extendidos debajo son editables y se almacenan aparte de battery health.',
  'master.cv.technicalSpecs.hvFieldNotPersistedHint':
    'Los campos HV extendidos se guardan en la especificación master HV (separada de capacidades de referencia SOH).',
  'master.cv.technicalSpecs.diRoutingSectionTitle': 'Enrutamiento de eventos de conducción (DI)',
  'master.cv.technicalSpecs.diRoutingHint':
    'LTE_R1 frente a SMART5 define cómo Driving Intelligence obtiene eventos de conducción. Es independiente de la modalidad de conexión verificada en onboarding (software/OEM frente a telemática física).',
  'master.cv.technicalSpecs.connectionModalityLabel': 'Modalidad de conexión verificada',
  'master.cv.technicalSpecs.telemetryFamilyLabel': 'Familia de telemetría',
  'master.cv.technicalSpecs.diRoutingHardwareLabel': 'Clasificación de enrutamiento DI (almacenada)',
  'master.cv.technicalSpecs.diRoutingReadOnlyHint':
    'El enrutamiento DI no se puede cambiar aquí. Cambiar la clasificación almacenada requiere una revisión DI aprobada por el operador.',
  'master.cv.technicalSpecs.diRoutingLteR1Info':
    'Enrutamiento LTE_R1: los eventos de conducción (frenado brusco, aceleración, curvas) usan la ruta de eventos de la API de telemetría DIMO. No es el tipo de dispositivo físico a bordo.',
};
