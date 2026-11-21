export const masterOrganizationsDe = {
  'master.organizations.create.success':
    'Organisation „{{name}}“ erstellt{{adminSuffix}}.',
  'master.organizations.create.successWithAdmin': ' inkl. Admin-Konto',
  'master.organizations.create.failed': 'Organisation konnte nicht erstellt werden.',
  'master.organizations.create.successRefreshFailed':
    'Organisation wurde erstellt, die operative Liste konnte nicht aktualisiert werden: {{error}}',
  'master.organizations.update.success': 'Organisation aktualisiert.',
  'master.organizations.update.failed': 'Organisation konnte nicht aktualisiert werden.',
  'master.organizations.lifecycle.title': 'Mandantenstatus',
  'master.organizations.lifecycle.current': 'Aktueller Status',
  'master.organizations.lifecycle.activate': 'Organisation aktivieren',
  'master.organizations.lifecycle.suspend': 'Organisation sperren',
  'master.organizations.lifecycle.reactivate': 'Organisation reaktivieren',
  'master.organizations.lifecycle.activateHint':
    'Setzt den Mandanten von ausstehend auf aktiv (betrieblich).',
  'master.organizations.lifecycle.suspendHint':
    'Sperrt betriebliche Mandanten-APIs bis zur Reaktivierung; Abrechnungs-Hinweise können weiter gelten.',
  'master.organizations.lifecycle.reactivateHint':
    'Stellt betrieblichen Mandantenzugang wieder her, sofern die Richtlinie es erlaubt.',
  'master.organizations.lifecycle.suspendConfirmTitle': 'Organisation sperren?',
  'master.organizations.lifecycle.suspendConfirmBody':
    'Mandanten-Nutzer verlieren betrieblichen Zugriff, bis die Organisation reaktiviert wird. Nur bestätigen, wenn beabsichtigt.',
  'master.organizations.lifecycle.archivedNote':
    'Archivierte Organisationen können hier nicht geändert werden. Retention-Offboarding ist noch nicht verfügbar.',
  'master.organizations.offboarding.title': 'Endgültiges Löschen nicht verfügbar',
  'master.organizations.offboarding.body':
    'Hard-Delete ist durch Plattformrichtlinie blockiert, bis konformes Organisations-Offboarding existiert. Wenden Sie sich an den Plattformbetrieb.',
  'master.organizations.mfa.stepUpSuccessRetry': '2FA bestätigt — Anfrage wird erneut ausgeführt…',
  'master.organizations.mfa.stepUpSuccessManual': '2FA bestätigt — bitte Aktion erneut ausführen.',
  'master.organizations.mfa.retryFailed': 'Wiederholung nach 2FA fehlgeschlagen: {{error}}',
  'master.organizations.mfa.enrollmentRequired':
    'MFA-Registrierung ist vor dieser Aktion erforderlich.',
};