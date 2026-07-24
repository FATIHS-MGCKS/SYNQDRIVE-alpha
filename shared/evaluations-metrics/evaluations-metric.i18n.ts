/**
 * Canonical DE/EN strings for evaluations metric i18n keys.
 * Backend registry tests assert every labelKey/descriptionKey exists here.
 * Frontend copies keys into rental/i18n/translations/{de,en}.ts (Prompt 6+ UI wiring).
 */

export type EvaluationsMetricLocale = 'de' | 'en';

export type EvaluationsMetricI18nEntry = {
  readonly label: Record<EvaluationsMetricLocale, string>;
  readonly description: Record<EvaluationsMetricLocale, string>;
};

/** Keys must match `evaluations.metrics.{metricId}.label|description` */
export const EVALUATIONS_METRIC_I18N: Record<string, EvaluationsMetricI18nEntry> = {
  'evaluations.metrics.fin.mtd_issued_revenue': {
    label: { de: 'Periodengerechter Umsatz (MTD)', en: 'Periodic Revenue MTD' },
    description: {
      de: 'Nettoumsatz nach Leistungsabgrenzung (Rechnungsdatum) abzüglich Storno/Gutschrift im Zeitraum — ohne Zahlungsdatum-Vermischung.',
      en: 'Net revenue by accrual (invoice date) minus period adjustments — no payment-date mixing.',
    },
  },
  'evaluations.metrics.fin.issued_revenue_strict_mtd': {
    label: { de: 'Fakturierter Umsatz (MTD)', en: 'Invoiced Revenue MTD' },
    description: {
      de: 'Ausgestellter Ausgangs-Umsatz nach Rechnungsdatum (brutto); Zahlungen aus Vormonaten zählen nicht.',
      en: 'Issued outgoing revenue by invoice date (gross); prior-month payments excluded.',
    },
  },
  'evaluations.metrics.fin.mtd_paid_revenue': {
    label: { de: 'Zahlungseingänge Umsatz (MTD)', en: 'Payment Receipts MTD' },
    description: {
      de: 'Eingegangene Zahlungen nach paidAt — unabhängig vom Rechnungsdatum.',
      en: 'Cash collected by paidAt — regardless of invoice date.',
    },
  },
  'evaluations.metrics.fin.cash_inflow_mtd': {
    label: { de: 'Zahlungseingänge (MTD)', en: 'Cash Inflow MTD' },
    description: {
      de: 'Alias für Zahlungseingänge nach paidAt (Invoice-Proxy).',
      en: 'Alias for payment receipts by paidAt (invoice proxy).',
    },
  },
  'evaluations.metrics.fin.reserved_revenue_mtd': {
    label: { de: 'Reservierter Umsatz (MTD)', en: 'Reserved Revenue MTD' },
    description: {
      de: 'Vorausbezahlte Buchungsentwürfe (OUTGOING_BOOKING DRAFT) im Monat.',
      en: 'Prepaid booking drafts (OUTGOING_BOOKING DRAFT) in month.',
    },
  },
  'evaluations.metrics.fin.avg_invoice_value_mtd': {
    label: { de: 'Ø Rechnungsbetrag (MTD)', en: 'Average Invoice Value MTD' },
    description: { de: 'Mittlerer Betrag je Umsatzposition im MTD.', en: 'Mean amount per revenue row in MTD.' },
  },
  'evaluations.metrics.fin.daily_revenue_mtd': {
    label: { de: 'Tagesumsatz (MTD)', en: 'Daily Revenue MTD' },
    description: { de: 'Umsatzsumme pro Kalendertag im laufenden Monat.', en: 'Revenue sum per calendar day in current month.' },
  },
  'evaluations.metrics.fin.top_customers_mtd': {
    label: { de: 'Top-Kunden (MTD)', en: 'Top Customers MTD' },
    description: { de: 'Bis zu 5 Kunden nach MTD-Umsatz.', en: 'Up to 5 customers by MTD revenue.' },
  },
  'evaluations.metrics.fin.top_vehicles_mtd': {
    label: { de: 'Top-Fahrzeuge (MTD)', en: 'Top Vehicles MTD' },
    description: { de: 'Bis zu 5 Fahrzeuge nach MTD-Umsatz.', en: 'Up to 5 vehicles by MTD revenue.' },
  },
  'evaluations.metrics.fin.mom_revenue_delta_pct': {
    label: { de: 'Umsatz Δ Vormonat', en: 'MoM Revenue Change' },
    description: { de: 'Prozentuale Änderung vs. Vormonat.', en: 'Percent change vs. previous month.' },
  },
  'evaluations.metrics.fin.revenue_lost_actual_mtd': {
    label: { de: 'Verlorener Umsatz (MTD)', en: 'Actual Lost Revenue MTD' },
    description: { de: 'Nachweislich nicht realisierter Umsatz (geplant).', en: 'Provably unrealized revenue (planned).' },
  },
  'evaluations.metrics.fin.cashflow_net_mtd': {
    label: { de: 'Netto-Cashflow (MTD)', en: 'Net Cashflow MTD' },
    description: {
      de: 'Zahlungseingänge minus Auszahlungen (bezahlte Eingangsrechnungen) minus Rückzahlungen im Zeitraum.',
      en: 'Payment receipts minus cash out (paid expenses) minus refunds in period.',
    },
  },
  'evaluations.metrics.fin.open_receivables': {
    label: { de: 'Offene Forderungen', en: 'Open Receivables' },
    description: { de: 'Offene, nicht überfällige Ausgangs-Forderungen.', en: 'Open, not overdue outgoing receivables.' },
  },
  'evaluations.metrics.fin.overdue_receivables': {
    label: { de: 'Überfällige Forderungen', en: 'Overdue Receivables' },
    description: { de: 'Forderungen mit OVERDUE oder dueDate < now.', en: 'Receivables with OVERDUE or dueDate < now.' },
  },
  'evaluations.metrics.fin.total_outstanding_receivables': {
    label: { de: 'Gesamter Außenstand', en: 'Total Outstanding Receivables' },
    description: { de: 'Offene plus überfällige Forderungen.', en: 'Open plus overdue receivables.' },
  },
  'evaluations.metrics.fin.mtd_expenses': {
    label: { de: 'Ausgaben (MTD)', en: 'Expenses MTD' },
    description: { de: 'Eingangsrechnungen nach Rechnungsdatum im Monat.', en: 'Incoming invoices by invoice date in month.' },
  },
  'evaluations.metrics.fin.daily_expenses_mtd': {
    label: { de: 'Tagesausgaben (MTD)', en: 'Daily Expenses MTD' },
    description: { de: 'Ausgabensumme pro Kalendertag im Monat.', en: 'Expense sum per calendar day in month.' },
  },
  'evaluations.metrics.fin.mom_expense_delta_pct': {
    label: { de: 'Ausgaben Δ Vormonat', en: 'MoM Expense Change' },
    description: { de: 'Prozentuale Ausgabenänderung vs. Vormonat.', en: 'Percent expense change vs. previous month.' },
  },
  'evaluations.metrics.fin.mtd_net_result': {
    label: { de: 'Operatives Ergebnis (MTD)', en: 'Operating Result MTD' },
    description: {
      de: 'Periodengerechter Nettoumsatz minus operative Ausgaben — nur bei vollständiger Kostenbasis (sonst PARTIAL).',
      en: 'Periodic net revenue minus operating expenses — only with complete cost basis (else PARTIAL).',
    },
  },
  'evaluations.metrics.fin.profit_margin_mtd': {
    label: { de: 'Ergebnismarge (MTD)', en: 'Operating Result Margin MTD' },
    description: {
      de: 'Operatives Ergebnis geteilt durch periodengerechten Nettoumsatz.',
      en: 'Operating result divided by periodic net revenue.',
    },
  },
  'evaluations.metrics.fin.daily_net_result_mtd': {
    label: { de: 'Tagesergebnis (MTD)', en: 'Daily Net Result MTD' },
    description: { de: 'Tagesumsatz minus Tagesausgaben.', en: 'Daily revenue minus daily expenses.' },
  },
  'evaluations.metrics.fin.contribution_margin_mtd': {
    label: { de: 'Deckungsbeitrag (MTD)', en: 'Contribution Margin MTD' },
    description: {
      de: 'Periodengerechter Nettoumsatz minus direkte variable Kosten (PARTIAL ohne Kostenklassifikation).',
      en: 'Periodic net revenue minus direct variable costs (PARTIAL without cost classification).',
    },
  },
  'evaluations.metrics.fin.recent_invoice_activity': {
    label: { de: 'Letzte Rechnungsaktivität', en: 'Recent Invoice Activity' },
    description: { de: 'Bis zu 8 jüngste Rechnungen org-weit.', en: 'Up to 8 most recent invoices org-wide.' },
  },
  'evaluations.metrics.fin.mtd_open_invoice_count': {
    label: { de: 'Offene Umsatzrechnungen (MTD)', en: 'Open Revenue Invoices MTD' },
    description: { de: 'Anzahl offener MTD-Umsatzpositionen.', en: 'Count of open MTD revenue invoices.' },
  },
  'evaluations.metrics.fin.mtd_paid_invoice_count': {
    label: { de: 'Bezahlte Umsatzrechnungen (MTD)', en: 'Paid Revenue Invoices MTD' },
    description: { de: 'Anzahl nach paidAt bezahlter Umsatzrechnungen.', en: 'Count of revenue invoices paid in MTD.' },
  },
  'evaluations.metrics.fin.mtd_expense_invoice_count': {
    label: { de: 'Ausgabenrechnungen (MTD)', en: 'Expense Invoices MTD' },
    description: { de: 'Anzahl Eingangsrechnungen im MTD.', en: 'Count of expense invoices in MTD.' },
  },
  'evaluations.metrics.fin.org_invoice_count': {
    label: { de: 'Rechnungen gesamt', en: 'Total Invoices' },
    description: { de: 'Gesamtzahl Rechnungen der Organisation.', en: 'Total invoice count for organization.' },
  },
  'evaluations.metrics.ins.low_utilization': {
    label: { de: 'Geringe Auslastung', en: 'Low Utilization' },
    description: { de: 'Fahrzeug ohne Buchung in Lookback und ohne Folgebuchung.', en: 'Vehicle idle in lookback with no upcoming booking.' },
  },
  'evaluations.metrics.ins.low_utilization.revenue_potential_eur': {
    label: { de: 'Umsatzpotenzial (Leerstand)', en: 'Revenue Potential (Idle)' },
    description: {
      de: 'Regelbasierte Schätzung: dailyRate × Leerstandstage.',
      en: 'Rule-based estimate: dailyRate × idle days.',
    },
  },
  'evaluations.metrics.ins.station_shortage': {
    label: { de: 'Stationsengpass', en: 'Station Shortage' },
    description: { de: 'Zu wenig verfügbare Fahrzeuge in 24h.', en: 'Too few available vehicles in 24h horizon.' },
  },
  'evaluations.metrics.ins.station_available_vehicle_count': {
    label: { de: 'Verfügbare Fahrzeuge (Station)', en: 'Available Vehicles (Station)' },
    description: { de: 'Verfügbare Fahrzeuge laut Stationsengpass-Insight.', en: 'Available vehicles from station shortage insight.' },
  },
  'evaluations.metrics.ins.tight_handover': {
    label: { de: 'Knappe Übergabe', en: 'Tight Handover' },
    description: { de: 'Puffer zwischen aufeinanderfolgenden Buchungen zu klein.', en: 'Insufficient buffer between consecutive bookings.' },
  },
  'evaluations.metrics.ins.return_needs_inspection': {
    label: { de: 'Rückgabe prüfen', en: 'Return Needs Inspection' },
    description: { de: 'Rückgabe ohne abgeschlossene Inspektion.', en: 'Return without completed inspection.' },
  },
  'evaluations.metrics.ins.service_window': {
    label: { de: 'Servicefenster', en: 'Service Window' },
    description: { de: 'Ausreichendes Wartungsfenster vor Buchung.', en: 'Sufficient maintenance window before booking.' },
  },
  'evaluations.metrics.ins.service_before_booking': {
    label: { de: 'Service vor Buchung', en: 'Service Before Booking' },
    description: { de: 'Service blockiert anstehenden Pickup.', en: 'Service blocks upcoming pickup.' },
  },
  'evaluations.metrics.ins.service_overdue': {
    label: { de: 'Service überfällig', en: 'Service Overdue' },
    description: { de: 'Wartungsintervall überschritten.', en: 'Maintenance interval exceeded.' },
  },
  'evaluations.metrics.ins.tuv_overdue': {
    label: { de: 'TÜV überfällig', en: 'TÜV Overdue' },
    description: { de: 'TÜV-Termin überschritten.', en: 'TÜV due date passed.' },
  },
  'evaluations.metrics.ins.bokraft_overdue': {
    label: { de: 'BOKraft überfällig', en: 'BOKraft Overdue' },
    description: { de: 'BOKraft-Termin überschritten.', en: 'BOKraft due date passed.' },
  },
  'evaluations.metrics.ins.hm_service_no_tracking': {
    label: { de: 'HM Service ohne Tracking', en: 'HM Service No Tracking' },
    description: { de: 'Informativer Compliance-Hinweis ohne HM-Tracking.', en: 'Informational compliance note without HM tracking.' },
  },
  'evaluations.metrics.ins.battery_critical_gated': {
    label: { de: 'Batterie kritisch (gebucht)', en: 'Battery Critical (Booked)' },
    description: { de: 'Kritische Batterie mit anstehender Buchung.', en: 'Critical battery with upcoming booking.' },
  },
  'evaluations.metrics.ins.tire_critical_gated': {
    label: { de: 'Reifen kritisch (gebucht)', en: 'Tire Critical (Booked)' },
    description: { de: 'Kritische Reifen mit anstehender Buchung.', en: 'Critical tires with upcoming booking.' },
  },
  'evaluations.metrics.ins.brake_critical_gated': {
    label: { de: 'Bremsen kritisch (gebucht)', en: 'Brake Critical (Booked)' },
    description: { de: 'Kritische Bremsen mit anstehender Buchung.', en: 'Critical brakes with upcoming booking.' },
  },
  'evaluations.metrics.ins.health_booking_financial_impact_eur': {
    label: { de: 'Buchungsumsatzrisiko (Health)', en: 'Booking Revenue at Risk (Health)' },
    description: { de: 'Geschätzter Buchungsumsatz bei Health-Risiko.', en: 'Estimated booking revenue under health risk.' },
  },
  'evaluations.metrics.ins.pickup_overdue': {
    label: { de: 'Abholung überfällig', en: 'Pickup Overdue' },
    description: { de: 'Bestätigte Buchung ohne Pickup-Protokoll nach Start.', en: 'Confirmed booking past start without pickup protocol.' },
  },
  'evaluations.metrics.ins.driving_assessment_device_quality': {
    label: { de: 'Fahrbewertung Gerätequalität', en: 'Driving Assessment Device Quality' },
    description: { de: 'Degradierte oder sich erholende Gerätequalität.', en: 'Degraded or recovering device quality.' },
  },
  'evaluations.metrics.ins.business_risks_count': {
    label: { de: 'Geschäftsrisiken', en: 'Business Risks' },
    description: { de: 'Anzahl sichtbarer Business-Risk-Insights.', en: 'Count of visible business-risk insights.' },
  },
  'evaluations.metrics.ins.estimated_financial_exposure_eur': {
    label: { de: 'Geschätztes finanzielles Exposure', en: 'Estimated Financial Exposure' },
    description: {
      de: 'Überfällige Forderungen plus regelbasierte Insight-Impacts.',
      en: 'Overdue receivables plus rule-based insight impacts.',
    },
  },
  'evaluations.metrics.ins.estimated_financial_risk': {
    label: { de: 'Finanzrisiko (geschätzt)', en: 'Estimated Financial Risk (legacy)' },
    description: { de: 'Veralteter Alias — nutze estimated_financial_exposure_eur.', en: 'Deprecated alias — use estimated_financial_exposure_eur.' },
  },
  'evaluations.metrics.ins.open_receivables_cockpit': {
    label: { de: 'Offene Forderungen (Cockpit)', en: 'Open Receivables (Cockpit)' },
    description: { de: 'Cockpit-Anzeige — gleiche Semantik wie fin.open_receivables.', en: 'Cockpit display — same as fin.open_receivables.' },
  },
  'evaluations.metrics.ins.critical_insights_count': {
    label: { de: 'Kritische Hinweise', en: 'Critical Insights' },
    description: { de: 'Anzahl CRITICAL Business-Risk-Insights.', en: 'Count of CRITICAL business-risk insights.' },
  },
  'evaluations.metrics.ins.critical_bookings_count': {
    label: { de: 'Kritische Buchungen (legacy)', en: 'Critical Bookings (legacy)' },
    description: { de: 'Veralteter Name — zählt Insights, nicht Buchungen.', en: 'Deprecated name — counts insights, not bookings.' },
  },
  'evaluations.metrics.ins.revenue_leakage_count': {
    label: { de: 'Revenue Leakage', en: 'Revenue Leakage' },
    description: { de: 'Anzahl Revenue-Leakage-Insights.', en: 'Count of revenue leakage insights.' },
  },
  'evaluations.metrics.ins.recommendations_visible_count': {
    label: { de: 'Empfohlene Maßnahmen', en: 'Visible Recommendations' },
    description: { de: 'Bis zu 6 priorisierte Empfehlungen.', en: 'Up to 6 prioritized recommendations.' },
  },
  'evaluations.metrics.ins.misuse_cases_visible_count': {
    label: { de: 'Nutzungsauffälligkeiten', en: 'Visible Misuse Cases' },
    description: { de: 'Angezeigte Missbrauchs-Fälle (max 8).', en: 'Displayed misuse cases (max 8).' },
  },
  'evaluations.metrics.ins.insights_run_stale': {
    label: { de: 'Insights veraltet', en: 'Insights Stale' },
    description: { de: 'Letzter Insight-Lauf älter als Schwellwert.', en: 'Last insight run older than threshold.' },
  },
  'evaluations.metrics.ins.insights_run_error': {
    label: { de: 'Insights Fehler', en: 'Insights Error' },
    description: { de: 'Fehler beim letzten Insight-Lauf.', en: 'Error in last insight evaluation run.' },
  },
  'evaluations.metrics.da.telemetry_last_received': {
    label: { de: 'Letzte Telemetrie', en: 'Last Telemetry Received' },
    description: { de: 'Zeitpunkt des letzten Telemetrie-Signals.', en: 'Timestamp of last telemetry signal.' },
  },
  'evaluations.metrics.da.signals_observed_count': {
    label: { de: 'Beobachtete Signale', en: 'Signals Observed' },
    description: { de: 'Anzahl persistierter Signalzeilen.', en: 'Count of persisted signal rows.' },
  },
  'evaluations.metrics.da.hf_availability_status': {
    label: { de: 'HF-Verfügbarkeit', en: 'HF Availability Status' },
    description: { de: 'Klassifikation der Hochfrequenz-Verfügbarkeit.', en: 'High-frequency availability classification.' },
  },
  'evaluations.metrics.da.avg_signal_interval_ms': {
    label: { de: 'Ø Signalintervall', en: 'Avg Signal Interval' },
    description: { de: 'Median/P95 Intervall aus ClickHouse.', en: 'Median/P95 interval from ClickHouse.' },
  },
  'evaluations.metrics.da.data_freshness_status': {
    label: { de: 'Datenfrische', en: 'Data Freshness Status' },
    description: { de: 'Frische-Klassifikation nach lastSeen.', en: 'Freshness classification from lastSeen.' },
  },
  'evaluations.metrics.da.signal_quality_score': {
    label: { de: 'Signalqualität (Trip)', en: 'Trip Signal Quality Score' },
    description: { de: 'Letzter Signal-Quality-Snapshot je Trip.', en: 'Latest signal quality snapshot per trip.' },
  },
  'evaluations.metrics.da.pipeline_stages': {
    label: { de: 'Pipeline-Status', en: 'Pipeline Stages' },
    description: { de: 'DIMO/CH Pipeline-Stufen.', en: 'DIMO/CH pipeline stage flags.' },
  },
  'evaluations.metrics.da.health_trace': {
    label: { de: 'Health-Trace', en: 'Health Trace' },
    description: { de: 'Modul-Evaluations-Trace.', en: 'Module evaluation trace.' },
  },
  'evaluations.metrics.da.clickhouse_diagnostics': {
    label: { de: 'ClickHouse-Diagnose', en: 'ClickHouse Diagnostics' },
    description: { de: 'Cluster-Diagnose (org-unabhängig).', en: 'Cluster diagnostics (org-agnostic).' },
  },
  'evaluations.metrics.fc.revenue_forecast_30d': {
    label: { de: 'Umsatzprognose (30 Tage)', en: 'Revenue Forecast (30d)' },
    description: { de: 'Statistische Umsatzprognose (geplant).', en: 'Statistical revenue forecast (planned).' },
  },
  'evaluations.metrics.fc.utilization_forecast_30d': {
    label: { de: 'Auslastungsprognose (30 Tage)', en: 'Utilization Forecast (30d)' },
    description: { de: 'Statistische Auslastungsprognose (geplant).', en: 'Statistical utilization forecast (planned).' },
  },
  'evaluations.metrics.fc.receivables_collection_forecast': {
    label: { de: 'Forderungseingangs-Prognose', en: 'Receivables Collection Forecast' },
    description: { de: 'Prognose Zahlungseingänge offener Forderungen.', en: 'Forecast collections on open receivables.' },
  },
  'evaluations.metrics.fc.maintenance_downtime_forecast': {
    label: { de: 'Wartungs-/Ausfallprognose', en: 'Maintenance Downtime Forecast' },
    description: { de: 'Prognose Wartungsstillstand (geplant).', en: 'Maintenance downtime forecast (planned).' },
  },
  'evaluations.metrics.ops.fleet_utilization_pct': {
    label: { de: 'Flottenauslastung', en: 'Fleet Utilization Rate' },
    description: { de: 'Gebuchte vs. verfügbare Fahrzeug-Tage (geplant).', en: 'Booked vs. available vehicle-days (planned).' },
  },
  'evaluations.metrics.ops.vehicle_idle_days': {
    label: { de: 'Leerstandstage', en: 'Idle Days' },
    description: { de: 'Policy-Schwellwert für Leerstand im Insight.', en: 'Policy idle threshold in low-utilization insight.' },
  },
  'evaluations.metrics.ops.station_revenue_rank_mtd': {
    label: { de: 'Stations-Ranking Umsatz', en: 'Station Revenue Ranking MTD' },
    description: { de: 'Stationen nach MTD-Umsatz sortiert (geplant).', en: 'Stations ranked by MTD revenue (planned).' },
  },
  'evaluations.metrics.ops.strengths_count': {
    label: { de: 'Stärken', en: 'Strengths Count' },
    description: { de: 'Operative Stärken (geplant).', en: 'Operational strengths (planned).' },
  },
  'evaluations.metrics.ops.weaknesses_count': {
    label: { de: 'Schwächen', en: 'Weaknesses Count' },
    description: { de: 'Operative Schwächen (geplant).', en: 'Operational weaknesses (planned).' },
  },
};

export function evaluationsMetricLabelKey(metricId: string): string {
  return `evaluations.metrics.${metricId}.label`;
}

export function evaluationsMetricDescriptionKey(metricId: string): string {
  return `evaluations.metrics.${metricId}.description`;
}
