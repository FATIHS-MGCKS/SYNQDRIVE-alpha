export const masterIntelligenceEs = {
  'master.nav.vsiIntelligence': 'VSI – inteligencia de señales',
  'master.nav.apdsIntelligence': 'APDS – polling adaptativo',
  'master.intelligence.vsi.title': 'VSI – inteligencia de señales',
  'master.intelligence.vsi.description':
    'Perfiles de señal del vehículo en solo lectura, cadencia observada, historial de revisiones si está capturado y explicaciones del capability resolver desde datos de producción.',
  'master.intelligence.apds.title': 'APDS – polling adaptativo',
  'master.intelligence.apds.description':
    'Decisiones shadow de reconciliación de solo lectura, historial de épocas, evidencia de poll real si está vinculada y correlación VSI histórica. Los next poll simulados no son polls ejecutados.',

  'master.intelligence.apds.loading': 'Cargando modelos de lectura APDS…',
  'master.intelligence.apds.error': 'No se pudo cargar la inteligencia APDS.',
  'master.intelligence.apds.latestDecision': 'Última decisión persistida',
  'master.intelligence.apds.activeEpoch': 'Época activa',
  'master.intelligence.apds.decisionsForVehicle': 'decisiones para este vehículo en la época',
  'master.intelligence.apds.shadowNotReal':
    'Las recomendaciones shadow y las marcas de next poll simulado no prueban un poll real programado o ejecutado.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'La correlación VSI histórica es evidencia de investigación — no necesariamente impulsó esta decisión APDS en runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Abrir VSI con hora as-of de la decisión',
  'master.intelligence.apds.empty.selectScope.title': 'Seleccione organización y vehículo',
  'master.intelligence.apds.empty.selectScope.body':
    'Elija alcance para cargar decisiones shadow y épocas persistidas. El enlace de origen del proveedor habilita correlación VSI; el alcance se valida en el servidor.',
  'master.intelligence.apds.section.epochs': 'Línea temporal de épocas de activación',
  'master.intelligence.apds.section.decisions': 'Explorador de decisiones',
  'master.intelligence.apds.section.detail': 'Detalle de la decisión',
  'master.intelligence.apds.col.time': 'Hora de decisión',
  'master.intelligence.apds.col.reason': 'Motivo',
  'master.intelligence.apds.col.policy': 'Política',
  'master.intelligence.apds.col.realPoll': 'Enlace a poll real',
  'master.intelligence.apds.detail.shadow': 'Recomendación shadow (salidas persistidas)',
  'master.intelligence.apds.detail.realPoll': 'Evidencia de poll real',
  'master.intelligence.apds.detail.vsiCorrelation': 'Correlación VSI histórica',
  'master.intelligence.apds.availability.AVAILABLE': 'Evidencia shadow disponible',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS no activado para este alcance',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'No hay decisiones de reconciliación capturadas',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Historial persistido no disponible',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidencia incompleta para este alcance',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Sin enlace a poll real',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Vinculado — registro de poll no verificado',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Vinculado — éxito registrado',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Vinculado — estado sin éxito',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Evidencia de poll real no disponible',
  'master.intelligence.pdi.loading': 'Cargando intelligence del dispositivo…',
  'master.intelligence.pdi.error': 'No se pudo cargar la intelligence PDI.',
  'master.intelligence.pdi.section.identity': 'Resumen de identidad',
  'master.intelligence.pdi.section.timeline': 'Línea temporal',
  'master.intelligence.pdi.section.episodes': 'Episodios de conexión',
  'master.intelligence.pdi.section.drift': 'Monitorización de identidad',
  'master.intelligence.pdi.snapshotNotHistory': 'Inventario actual y espejo live son instantáneas, no historial completo.',
  'master.intelligence.pdi.notApplicableR1': 'Monitorización R1 física no aplicable (p. ej. Tesla solo software).',
  'master.intelligence.pdi.noDriftHistory': 'Sin historial persistido de drift. Sin registros no prueba ausencia de drift.',
  'master.intelligence.pdi.episodeNotPoll': 'Episodios de conexión = evidencia lifecycle persistida, no poll APDS.',
  'master.intelligence.pdi.noEpisodes': 'Sin episodios para el alcance de vehículo actual.',
  'master.intelligence.pdi.emptyTimeline': 'Sin entradas de timeline persistidas.',
  'master.intelligence.pdi.evaluatedAt': 'Evidencia evaluada',
  'master.intelligence.section.context': 'Contexto URL',
  'master.intelligence.section.crossLinks': 'Enlaces cruzados',
  'master.intelligence.section.previewComponents': 'Vista previa (sin datos en vivo)',
  'master.intelligence.section.evidenceSemantics': 'Semántica de evidencia',
  'master.intelligence.url.invalidParams': 'Parámetros URL no válidos ignorados: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Las insignias muestran solo la semántica de etiquetas del backend. Sin datos de producción en PR1.',
  'master.intelligence.vsi.empty.title': 'API de lectura aún no conectadas',
  'master.intelligence.vsi.empty.body':
    'PR2 cargará perfiles de señal, historial de revisión y explicaciones del resolver vía endpoints de solo lectura.',
  'master.intelligence.apds.empty.title': 'API de lectura aún no conectadas',
  'master.intelligence.apds.empty.body':
    'PR3 cargará decisiones shadow, épocas de activación y correlación VSI. Las filas shadow nunca son polls ejecutados.',
  'master.intelligence.crossLink.vehicle': 'Abrir vehículo',
  'master.intelligence.crossLink.device': 'Abrir inventario de dispositivos',
  'master.intelligence.crossLink.vsi': 'Abrir VSI',
  'master.intelligence.crossLink.apds': 'Abrir APDS',
  'master.intelligence.crossLink.contextMissing':
    'El enlace a {{target}} necesita más contexto en la URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h observado',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h observado',
  'master.intelligence.badge.lv.UNKNOWN': 'LV desconocido',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Transmisión en standby observada aproximadamente cada 8 horas (no configuración de hardware confirmada).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Transmisión en standby observada aproximadamente cada 24 horas (no configuración de hardware confirmada).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Evidencia de transmisión standby insuficiente o bloqueada.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM alta frecuencia (empírico)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM estándar (empírico)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM desconocido',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Perfil RPM de alta frecuencia clasificado empíricamente. No prueba de muestreo nativo a 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Densidad RPM estándar clasificada empíricamente.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Evidencia de cadencia RPM insuficiente para una etiqueta estable.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Perfil RPM de combustión no aplicable (p. ej. BEV). No es lo mismo que calidad de señal desconocida.',
  'master.intelligence.badge.limitation': 'Limitación del backend: {{code}}',
  'master.intelligence.confidence.HIGH': 'Confianza: alta',
  'master.intelligence.confidence.MEDIUM': 'Confianza: media',
  'master.intelligence.confidence.LOW': 'Confianza: baja',
  'master.intelligence.confidence.UNKNOWN': 'Confianza: desconocida',
  'master.intelligence.density.SUB_ONE_HZ': 'Densidad: bajo 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densidad: buckets de 1 s no probados',
  'master.intelligence.density.IRREGULAR': 'Densidad: irregular',
  'master.intelligence.density.UNKNOWN': 'Densidad: desconocida',
  'master.intelligence.density.NOT_APPLICABLE': 'Densidad: no aplicable',
  'master.intelligence.evidence.title': 'Marcas de tiempo de evidencia',
  'master.intelligence.evidence.evaluatedAt': 'Evaluado el',
  'master.intelligence.evidence.providerSourceTimestamp': 'Hora fuente del proveedor',
  'master.intelligence.evidence.providerFetchedAt': 'Hora de fetch del proveedor',
  'master.intelligence.evidence.profileRevision': 'Revisión de perfil',
  'master.intelligence.evidence.fetchNotSignalProof':
    'La hora de fetch es ingestión SynqDrive — no prueba de una señal nueva del proveedor.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Las decisiones shadow APDS describen reconciliación simulada salvo que haya un ID de poll real vinculado.',
  'master.intelligence.evidence.kind.observed': 'Tipo: evidencia observada del proveedor',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tipo: evaluación simulada / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tipo: ejecución de poll real verificada',
  'master.intelligence.evidence.kind.not_available': 'Tipo: no disponible',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tipo: evidencia insuficiente',
  'master.intelligence.evidence.kind.not_applicable': 'Tipo: no aplicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tipo: evaluación bloqueada',
  'master.intelligence.blocked.title': 'Evaluación bloqueada',
  'master.intelligence.blocked.body':
    'Clasificación de perfil en pausa ({{code}}). Una etiqueta anterior no debe mostrarse como actual.',

  'master.intelligence.section.fleetOverview': 'Alcance de flota y perfiles',
  'master.intelligence.section.signals': 'Detalle de señales',
  'master.intelligence.section.revisions': 'Historial de revisiones del perfil',
  'master.intelligence.section.capability': 'Capability resolver (solo lectura)',

  'master.intelligence.vsi.picker.org': 'Organización',
  'master.intelligence.vsi.picker.vehicle': 'Vehículo',
  'master.intelligence.vsi.picker.link': 'Enlace de origen del proveedor',
  'master.intelligence.vsi.loading': 'Cargando modelos VSI…',
  'master.intelligence.vsi.error': 'No se pudo cargar la inteligencia VSI.',
  'master.intelligence.vsi.retry': 'Reintentar',

  'master.intelligence.vsi.empty.selectScope.title': 'Seleccione organización y vehículo',
  'master.intelligence.vsi.empty.selectScope.body':
    'Elija organización y vehículo para cargar perfiles VSI persistidos. El alcance se valida en el servidor.',

  'master.intelligence.vsi.noProfiles.title': 'Sin perfiles VSI materializados',
  'master.intelligence.vsi.noProfiles.body':
    'Aún no hay perfil de capability para este vehículo. No es lo mismo que historial de revisiones desactivado.',

  'master.intelligence.vsi.decision.lv': 'Código de decisión LV: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Código de decisión RPM: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Las etiquetas de cadencia describen patrones de transmisión observados, no configuración nativa del hardware.',
  'master.intelligence.vsi.signals.canonical': 'Señal canónica',
  'master.intelligence.vsi.signals.provider': 'Nombre del proveedor',
  'master.intelligence.vsi.signals.quality': 'Calidad / confianza',
  'master.intelligence.vsi.signals.observedAt': 'Última observación (UTC + local)',
  'master.intelligence.vsi.signals.limitations': 'Limitaciones',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'No aplicable (tren motriz)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nunca observado',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Observado',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Observado (obsoleto)',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Las RPM del motor usan dos planos de evidencia separados. El estado snapshot proviene del último bundle vehicle latest state; HF/cadencia de puntos HF reflejados y viajes finalizados. No son intercambiables.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Ventana de observación: último bundle del proveedor atribuido al materializar el perfil (sin historial HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadencia (ventanas de viaje)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Ventana de observación: enriquecimiento de cadencia HF del link (hasta 14 días de viajes finalizados).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Observación empírica',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Frescura',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Última observación válida',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Calidad / confianza',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Procedencia',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Recuento de muestras HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Perfil RPM activo',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Perfil evaluado en',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Viajes finalizados en ventana de cadencia',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Decisión de clasificación',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Clasificaciones de viaje de apoyo',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'La clasificación de cadencia RPM no aplica a este tren motriz (p. ej. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Sin evidencia HF de cadencia en el perfil persistido (cadenceIntelligence ausente o vacío).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadencia',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Perfil {{profile}} · {{samples}} muestras HF (ver panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Ver panel abajo',

  'master.intelligence.vsi.revision.loading': 'Cargando historial de revisiones…',
  'master.intelligence.vsi.revision.loadError': 'No se pudo cargar el historial de revisiones.',
  'master.intelligence.vsi.revision.retry': 'Reintentar historial de revisiones',
  'master.intelligence.vsi.revision.notCaptured': 'Historial: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'La captura P5-H1 está desactivada. La falta de historial no significa que el perfil no haya cambiado.',
  'master.intelligence.vsi.revision.moreAvailable': 'Hay más revisiones — paginación por cursor vía API.',

  'master.intelligence.vsi.asOf.title': 'Resolución de revisión as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Hora de decisión',
  'master.intelligence.vsi.asOf.authority': 'Autoridad',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Resúmenes de solo lectura de las API VSI, APDS y PDI. Las etiquetas reflejan evidencia observada o persistida — no prueba de hardware.',
  'master.intelligence.vehicleDetail.loading': 'Cargando resúmenes de intelligence…',
  'master.intelligence.vehicleDetail.error': 'No se pudieron cargar los resúmenes de intelligence para este vehículo.',
  'master.intelligence.vehicleDetail.openVsi': 'Abrir detalle VSI',
  'master.intelligence.vehicleDetail.openApds': 'Abrir detalle APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Abrir detalle del dispositivo',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Sin decisión persistida en el ámbito.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Ningún dispositivo físico instalado único atribuido a este vehículo.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Varios enlaces fuente del proveedor — se muestra el enlace principal; confirme el enlace en VSI/APDS antes de suposiciones entre vehículos.',
} as const;
