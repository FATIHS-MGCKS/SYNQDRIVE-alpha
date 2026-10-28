export const masterIntelligenceTr = {
  'master.nav.vsiIntelligence': 'VSI – sinyal istihbaratı',
  'master.nav.apdsIntelligence': 'APDS – uyarlanabilir polling',
  'master.intelligence.vsi.title': 'VSI – sinyal istihbaratı',
  'master.intelligence.vsi.description':
    'Salt okunur sinyal profilleri, gözlemlenen kadans ve değerlendirme kanıtı. Canlı filo verisi PR2’de.',
  'master.intelligence.apds.title': 'APDS – uyarlanabilir polling',
  'master.intelligence.apds.description':
    'Shadow uzlaştırma kararları ve bağlı gerçek poll kanıtı. Karar geçmişi PR3’te.',
  'master.intelligence.section.context': 'URL bağlamı',
  'master.intelligence.section.crossLinks': 'Çapraz bağlantılar',
  'master.intelligence.section.previewComponents': 'Sunum önizlemesi (canlı veri yok)',
  'master.intelligence.section.evidenceSemantics': 'Kanıt anlamları',
  'master.intelligence.url.invalidParams': 'Geçersiz URL parametreleri yok sayıldı: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Rozetler yalnızca backend etiket anlamını gösterir. PR1’de üretim verisi yüklenmez.',
  'master.intelligence.vsi.empty.title': 'Okuma API’leri henüz bağlı değil',
  'master.intelligence.vsi.empty.body':
    'PR2, salt okunur uç noktalarla araç sinyal profilleri, revizyon geçmişi ve resolver açıklamalarını yükleyecek.',
  'master.intelligence.apds.empty.title': 'Okuma API’leri henüz bağlı değil',
  'master.intelligence.apds.empty.body':
    'PR3 shadow kararları, aktivasyon dönemleri ve VSI korelasyonunu yükleyecek. Shadow satırları asla yürütülmüş poll değildir.',
  'master.intelligence.crossLink.vehicle': 'Aracı aç',
  'master.intelligence.crossLink.device': 'Cihaz envanterini aç',
  'master.intelligence.crossLink.vsi': 'VSI aç',
  'master.intelligence.crossLink.apds': 'APDS aç',
  'master.intelligence.crossLink.contextMissing':
    '{{target}} bağlantısı URL’de daha fazla bağlam gerektirir (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 sa gözlemlendi',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 sa gözlemlendi',
  'master.intelligence.badge.lv.UNKNOWN': 'LV bilinmiyor',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Yaklaşık 8 saatte bir gözlemlenen bekleme iletimi (doğrulanmış donanım yapılandırması değil).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Yaklaşık 24 saatte bir gözlemlenen bekleme iletimi (doğrulanmış donanım yapılandırması değil).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Yetersiz veya engellenmiş bekleme iletim kanıtı.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM yüksek frekans (ampirik)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standart (ampirik)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM bilinmiyor',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Ampirik olarak yüksek frekanslı RPM profili. Yerel 1 Hz örnekleme kanıtı değildir.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Ampirik standart RPM gözlem yoğunluğu.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Kararlı etiket için yetersiz RPM kadans kanıtı.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM profili uygulanamaz (ör. BEV). Bu, bilinmeyen sinyal kalitesi ile aynı değildir.',
  'master.intelligence.badge.limitation': 'Backend sınırlaması: {{code}}',
  'master.intelligence.confidence.HIGH': 'Güven: yüksek',
  'master.intelligence.confidence.MEDIUM': 'Güven: orta',
  'master.intelligence.confidence.LOW': 'Güven: düşük',
  'master.intelligence.confidence.UNKNOWN': 'Güven: bilinmiyor',
  'master.intelligence.density.SUB_ONE_HZ': 'Yoğunluk: 1 Hz altı',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Yoğunluk: 1 sn bucket kanıtlanmadı',
  'master.intelligence.density.IRREGULAR': 'Yoğunluk: düzensiz',
  'master.intelligence.density.UNKNOWN': 'Yoğunluk: bilinmiyor',
  'master.intelligence.density.NOT_APPLICABLE': 'Yoğunluk: uygulanamaz',
  'master.intelligence.evidence.title': 'Kanıt zaman damgaları',
  'master.intelligence.evidence.evaluatedAt': 'Değerlendirme zamanı',
  'master.intelligence.evidence.providerSourceTimestamp': 'Sağlayıcı kaynak zamanı',
  'master.intelligence.evidence.providerFetchedAt': 'Sağlayıcı fetch zamanı',
  'master.intelligence.evidence.profileRevision': 'Profil revizyonu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch zamanı SynqDrive alımını gösterir — yeni sağlayıcı sinyali kanıtı değildir.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow kararları, gerçek poll kimliği bağlı değilse simüle uzlaştırma sonucudur.',
  'master.intelligence.evidence.kind.observed': 'Tür: gözlemlenen sağlayıcı kanıtı',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tür: simüle / shadow değerlendirme',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tür: doğrulanmış gerçek poll',
  'master.intelligence.evidence.kind.not_available': 'Tür: kullanılamıyor',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tür: yetersiz kanıt',
  'master.intelligence.evidence.kind.not_applicable': 'Tür: uygulanamaz',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tür: değerlendirme engellendi',
  'master.intelligence.blocked.title': 'Değerlendirme engellendi',
  'master.intelligence.blocked.body':
    'Profil sınıflandırması duraklatıldı ({{code}}). Eski etiket güncel gibi gösterilmemelidir.',
} as const;
