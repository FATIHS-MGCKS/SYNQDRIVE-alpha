import { TaskType } from '@prisma/client';
import {
  checklistForType,
  getTaskTypeChecklistTemplate,
  TASK_TYPE_CHECKLIST_TEMPLATES,
} from './task-templates';

const CATEGORY_A_TYPES: TaskType[] = [
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
  'REPAIR',
];

const CATEGORY_B_TYPES: TaskType[] = ['CUSTOMER_FOLLOWUP'];

const CATEGORY_C_TYPES: TaskType[] = ['CUSTOM', 'DOCUMENT_REVIEW', 'INVOICE_REQUIRED'];

describe('task-templates', () => {
  describe('category A — operative checklists', () => {
    it.each(CATEGORY_A_TYPES)('defines a non-empty template for %s', (type) => {
      const items = checklistForType(type);
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item, index) => {
        expect(item.title.trim()).not.toBe('');
        expect(item.sortOrder).toBe(index);
        expect(typeof item.isRequired).toBe('boolean');
      });
    });

    it('keeps booking preparation steps in operational order', () => {
      expect(checklistForType('BOOKING_PREPARATION').map((i) => i.title)).toEqual([
        'Pflichtdokumente vollständig',
        'Zahlungsstatus geprüft',
        'Fahrzeugverfügbarkeit und Freigabe geprüft',
        'Reinigung bestätigt',
        'Tank- oder Ladestand geprüft',
        'Vereinbartes Zubehör vorbereitet',
        'Übergabe ist organisatorisch vorbereitet',
      ]);
      const required = checklistForType('BOOKING_PREPARATION').filter((i) => i.isRequired);
      expect(required.map((i) => i.title)).toEqual([
        'Pflichtdokumente vollständig',
        'Reinigung bestätigt',
        'Tank- oder Ladestand geprüft',
        'Vereinbartes Zubehör vorbereitet',
        'Übergabe ist organisatorisch vorbereitet',
      ]);
    });

    it('marks service/repair result documentation as optional orientation', () => {
      for (const type of ['VEHICLE_INSPECTION', 'REPAIR', 'TIRE_CHECK', 'BRAKE_CHECK'] as const) {
        const resultItem = checklistForType(type).find((i) => i.title === 'Ergebnis dokumentieren');
        expect(resultItem).toBeDefined();
        expect(resultItem!.isRequired).toBe(false);
        expect(resultItem!.description).toMatch(/Abschluss-Code/);
      }
    });

    it('uses concrete human steps for VEHICLE_SERVICE without result-documentation checklist row', () => {
      expect(checklistForType('VEHICLE_SERVICE').map((i) => i.title)).toEqual([
        'Servicehistorie prüfen',
        'Fälligkeit bestätigen',
        'ServiceCase oder Werkstatttermin anlegen',
      ]);
      expect(getTaskTypeChecklistTemplate('VEHICLE_SERVICE')?.metadata.resolutionCodes).toEqual([
        'SERVICE_SCHEDULED',
        'SERVICE_ALREADY_COMPLETED',
        'SERVICE_DUE_DATE_CORRECTED',
        'FALSE_POSITIVE',
        'SERVICE_CASE_COMPLETED',
      ]);
    });

    it('keeps concrete operative steps required on brake checks', () => {
      const items = checklistForType('BRAKE_CHECK');
      expect(items.find((i) => i.title === 'Messwerte eintragen')?.isRequired).toBe(true);
      expect(items.find((i) => i.title === 'Rechnung/Dokument hochladen')?.isRequired).toBe(true);
    });
  });

  describe('category B — optional orientation', () => {
    it.each(CATEGORY_B_TYPES)('defines only optional items for %s', (type) => {
      const items = checklistForType(type);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.isRequired === false)).toBe(true);
    });
  });

  describe('category C — no auto generic checklist', () => {
    it.each(CATEGORY_C_TYPES)('returns an empty checklist for %s', (type) => {
      expect(checklistForType(type)).toEqual([]);
      expect(getTaskTypeChecklistTemplate(type)).toBeNull();
    });
  });

  describe('template metadata', () => {
    it('exposes resolution metadata for compliance task types', () => {
      const brake = getTaskTypeChecklistTemplate('BRAKE_CHECK');
      expect(brake?.metadata.requiresResolutionNote).toBe(true);
      expect(brake?.metadata.resolutionCodes).toEqual(
        expect.arrayContaining(['BRAKE_MEASURED_OK', 'BRAKE_PARTS_REPLACED']),
      );
      expect(brake?.metadata.defaultNextAction).toBeTruthy();
    });

    it('does not define templates for invoice or document review types', () => {
      expect(TASK_TYPE_CHECKLIST_TEMPLATES.INVOICE_REQUIRED).toBeUndefined();
      expect(TASK_TYPE_CHECKLIST_TEMPLATES.DOCUMENT_REVIEW).toBeUndefined();
      expect(TASK_TYPE_CHECKLIST_TEMPLATES.CUSTOM).toBeUndefined();
    });

    it('returns defensive copies from checklistForType', () => {
      const first = checklistForType('BOOKING_PICKUP');
      first[0]!.title = 'mutated';
      expect(checklistForType('BOOKING_PICKUP')[0]!.title).toBe('Kunde identifizieren');
    });

    it('BOOKING_RETURN checklist covers operative return only (no invoice step)', () => {
      const items = checklistForType('BOOKING_RETURN').map((item) => item.title);
      expect(items).toEqual([
        'Kilometerstand erfassen',
        'Tankstand/Ladestand erfassen',
        'Außenkontrolle durchführen',
        'Innenkontrolle durchführen',
        'Schäden dokumentieren',
        'Rückgabeprotokoll abschließen',
      ]);
      expect(items.some((title) => /rechnung/i.test(title))).toBe(false);
    });
  });
});
