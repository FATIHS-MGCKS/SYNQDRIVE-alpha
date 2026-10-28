export const masterIntelligenceFr = {
  'master.nav.vsiIntelligence': 'VSI – intelligence signal',
  'master.nav.apdsIntelligence': 'APDS – polling adaptatif',

  'master.intelligence.vsi.title': 'VSI – intelligence signal',
  'master.intelligence.vsi.description':
    'Profils de signaux en lecture seule, cadence observée et preuves d’évaluation. Données live en PR2.',
  'master.intelligence.apds.title': 'APDS – polling adaptatif',
  'master.intelligence.apds.description':
    'Décisions shadow de réconciliation et preuves de poll réel liées. Historique en PR3.',

  'master.intelligence.section.context': 'Contexte URL',
  'master.intelligence.section.crossLinks': 'Liens croisés',
  'master.intelligence.section.previewComponents': 'Aperçu de présentation (pas de données live)',
  'master.intelligence.section.evidenceSemantics': 'Sémantique des preuves',

  'master.intelligence.url.invalidParams': 'Paramètres URL invalides ignorés : {{params}}',

  'master.intelligence.vsi.previewNote':
    'Les badges illustrent uniquement la sémantique des libellés backend. Aucune donnée production en PR1.',
  'master.intelligence.vsi.empty.title': 'API de lecture non connectées',
  'master.intelligence.vsi.empty.body':
    'PR2 chargera les profils signal véhicule, l’historique de révision et le resolver via des endpoints en lecture seule.',

  'master.intelligence.apds.empty.title': 'API de lecture non connectées',
  'master.intelligence.apds.empty.body':
    'PR3 chargera les décisions shadow, épisodes d’activation et corrélation VSI. Les lignes shadow ne sont jamais des polls exécutés.',

  'master.intelligence.crossLink.vehicle': 'Ouvrir le véhicule',
  'master.intelligence.crossLink.device': 'Ouvrir l’inventaire appareils',
  'master.intelligence.crossLink.vsi': 'Ouvrir VSI',
  'master.intelligence.crossLink.apds': 'Ouvrir APDS',
  'master.intelligence.crossLink.contextMissing':
    'Le lien vers {{target}} nécessite plus de contexte dans l’URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h observé',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h observé',
  'master.intelligence.badge.lv.UNKNOWN': 'LV inconnu',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Transmission veille observée environ toutes les 8 heures (pas une config matérielle confirmée).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Transmission veille observée environ toutes les 24 heures (pas une config matérielle confirmée).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Preuves de transmission veille insuffisantes ou bloquées.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM haute fréquence (empirique)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirique)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM inconnu',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Profil RPM haute fréquence classé empiriquement. Ce n’est pas une preuve d’échantillonnage natif à 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Densité d’observation RPM standard classée empiriquement.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Preuves de cadence RPM insuffisantes pour un libellé stable.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM thermique non applicable (ex. BEV). Ce n’est pas la même chose qu’une qualité de signal inconnue.',

  'master.intelligence.badge.limitation': 'Limitation backend : {{code}}',

  'master.intelligence.confidence.HIGH': 'Confiance : élevée',
  'master.intelligence.confidence.MEDIUM': 'Confiance : moyenne',
  'master.intelligence.confidence.LOW': 'Confiance : faible',
  'master.intelligence.confidence.UNKNOWN': 'Confiance : inconnue',

  'master.intelligence.density.SUB_ONE_HZ': 'Densité : sous 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densité : buckets 1 s non prouvés',
  'master.intelligence.density.IRREGULAR': 'Densité : irrégulière',
  'master.intelligence.density.UNKNOWN': 'Densité : inconnue',
  'master.intelligence.density.NOT_APPLICABLE': 'Densité : non applicable',

  'master.intelligence.evidence.title': 'Horodatages des preuves',
  'master.intelligence.evidence.evaluatedAt': 'Évalué le',
  'master.intelligence.evidence.providerSourceTimestamp': 'Heure source fournisseur',
  'master.intelligence.evidence.providerFetchedAt': 'Heure de fetch fournisseur',
  'master.intelligence.evidence.profileRevision': 'Révision de profil',
  'master.intelligence.evidence.fetchNotSignalProof':
    'L’heure de fetch indique l’ingestion SynqDrive — pas une preuve de nouveau signal fournisseur.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Les décisions shadow APDS décrivent une réconciliation simulée sauf si un ID de poll réel est lié.',

  'master.intelligence.evidence.kind.observed': 'Type : preuve fournisseur observée',
  'master.intelligence.evidence.kind.simulated_shadow': 'Type : évaluation simulée / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Type : exécution de poll réelle vérifiée',
  'master.intelligence.evidence.kind.not_available': 'Type : non disponible',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Type : preuves insuffisantes',
  'master.intelligence.evidence.kind.not_applicable': 'Type : non applicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Type : évaluation bloquée',

  'master.intelligence.blocked.title': 'Évaluation bloquée',
  'master.intelligence.blocked.body':
    'Classification de profil en pause ({{code}}). Un ancien libellé ne doit pas être affiché comme actuel.',
} as const;
