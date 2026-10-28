export const masterIntelligenceEs = {
  'master.nav.vsiIntelligence': 'VSI – inteligencia de señales',
  'master.nav.apdsIntelligence': 'APDS – polling adaptativo',
  'master.intelligence.vsi.title': 'VSI – inteligencia de señales',
  'master.intelligence.vsi.description':
    'Perfiles de señal de solo lectura, cadencia observada y evidencia de evaluación. Datos en vivo en PR2.',
  'master.intelligence.apds.title': 'APDS – polling adaptativo',
  'master.intelligence.apds.description':
    'Decisiones shadow de reconciliación y evidencia de poll real vinculada. Historial en PR3.',
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
} as const;
