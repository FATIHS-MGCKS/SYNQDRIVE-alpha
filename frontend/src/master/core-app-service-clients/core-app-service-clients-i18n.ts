const DE: Record<string, string> = {
  'master.serviceClients.title': 'Core-App Service Clients',
  'master.serviceClients.meta':
    'M2M-Clients für externe Produkt-Backends (FLEET, VYMOD, RENTAL). Secrets werden nur einmal angezeigt.',
  'master.serviceClients.refresh': 'Aktualisieren',
  'master.serviceClients.secretTitle': 'Client-Secret (nur einmal sichtbar)',
  'master.serviceClients.secretDismiss': 'Schließen und aus Speicher entfernen',
  'master.serviceClients.newClient': 'Neuer Client',
  'master.serviceClients.registered': 'Registrierte Clients',
  'master.serviceClients.detail': 'Client-Detail',
  'master.serviceClients.scopesLabel': 'Scopes',
  'master.serviceClients.scopesEdit': 'Scopes bearbeiten',
  'master.serviceClients.scopesSave': 'Scopes speichern',
  'master.serviceClients.activeGrants': 'Aktive Org-Grants',
  'master.serviceClients.deactivate': 'Deaktivieren',
  'master.serviceClients.activate': 'Aktivieren',
  'master.serviceClients.rotate': 'Secret rotieren',
  'master.serviceClients.orgGrants': 'Organisations-Grants',
  'master.serviceClients.orgIdPlaceholder': 'Organisation-ID',
  'master.serviceClients.attachGrant': 'Grant anlegen (REVOKED)',
  'master.serviceClients.revokeGrant': 'Widerrufen',
  'master.serviceClients.activateGrant': 'Aktivieren',
  'master.serviceClients.refreshFailed': 'Aktualisierung nach Änderung fehlgeschlagen',
  'master.serviceClients.loading': 'Clients werden geladen…',
  'master.serviceClients.loadingGrants': 'Lade…',
  'master.serviceClients.createDisabled': 'Client erstellen (DISABLED)',
  'master.serviceClients.rotateConfirm': 'Client-Secret wirklich rotieren? Bestehende Tokens werden ungültig.',
  'master.serviceClients.scope.core_entitlements_read': 'Kern-Entitlements lesen',
  'master.serviceClients.scope.core_app_vehicle_read': 'Fahrzeuge lesen (M2M)',
};

export function tServiceClients(key: string): string {
  return DE[key] ?? key;
}