import { describe, expect, it } from 'vitest';
import {
  buildIntakeProcessingSteps,
  errorPhaseToProcessingStep,
  resolveActiveProcessingStepIndex,
} from './document-intake-processing-steps';

const LABELS = {
  file_check: 'Datei wird geprüft',
  file_stored: 'Datei wurde sicher gespeichert',
  text_recognition: 'Text wird erkannt',
  classification: 'Dokument wird eingeordnet',
  data_preparation: 'Daten und Zuordnungen werden vorbereitet',
  ready_for_review: 'Bereit zur Prüfung',
} as const;

describe('document-intake-processing-steps', () => {
  it('maps success path through OCR with completed prior steps', () => {
    const steps = buildIntakeProcessingSteps({
      flow: 'ocr',
      status: 'PROCESSING',
      processingStage: 'OCR',
      labels: LABELS,
    });

    expect(steps.find((s) => s.id === 'file_check')?.state).toBe('complete');
    expect(steps.find((s) => s.id === 'file_stored')?.state).toBe('complete');
    expect(steps.find((s) => s.id === 'text_recognition')?.state).toBe('active');
    expect(steps.find((s) => s.id === 'classification')?.state).toBe('pending');
    expect(steps.find((s) => s.id === 'ready_for_review')?.state).toBe('pending');
  });

  it('marks failure on the correct step without greenwashing later steps', () => {
    const steps = buildIntakeProcessingSteps({
      flow: 'failed',
      status: 'FAILED',
      processingStage: 'OCR',
      errorPhase: 'OCR',
      labels: LABELS,
      retryDetail: 'OCR fehlgeschlagen — erneut versuchen.',
    });

    expect(steps.find((s) => s.id === 'file_check')?.state).toBe('complete');
    expect(steps.find((s) => s.id === 'file_stored')?.state).toBe('complete');
    expect(steps.find((s) => s.id === 'text_recognition')?.state).toBe('failed');
    expect(steps.find((s) => s.id === 'text_recognition')?.detail).toContain('erneut');
    expect(steps.find((s) => s.id === 'classification')?.state).toBe('pending');
    expect(steps.find((s) => s.id === 'data_preparation')?.state).toBe('pending');
    expect(steps.find((s) => s.id === 'ready_for_review')?.state).toBe('pending');
  });

  it('shows retry on the active storage step', () => {
    const steps = buildIntakeProcessingSteps({
      flow: 'retrying',
      status: 'QUEUED',
      processingStage: 'QUEUE',
      labels: LABELS,
      retryDetail: 'Verarbeitung wird erneut gestartet…',
    });

    expect(steps.find((s) => s.id === 'file_check')?.state).toBe('complete');
    expect(steps.find((s) => s.id === 'file_stored')?.state).toBe('active');
    expect(steps.find((s) => s.id === 'file_stored')?.detail).toContain('erneut');
    expect(steps.find((s) => s.id === 'text_recognition')?.state).toBe('pending');
  });

  it('highlights awaiting document type on classification step', () => {
    const steps = buildIntakeProcessingSteps({
      flow: 'awaiting_type',
      status: 'AWAITING_DOCUMENT_TYPE',
      processingStage: 'CLASSIFICATION',
      labels: LABELS,
      awaitingTypeDetail: 'Bitte Dokumenttyp auswählen.',
    });

    const classification = steps.find((s) => s.id === 'classification');
    expect(classification?.state).toBe('active');
    expect(classification?.detail).toBe('Bitte Dokumenttyp auswählen.');
    expect(resolveActiveProcessingStepIndex({ flow: 'awaiting_type', status: 'AWAITING_DOCUMENT_TYPE' })).toBe(3);
  });

  it('completes all steps when ready for review', () => {
    const steps = buildIntakeProcessingSteps({
      flow: 'ready',
      status: 'READY_FOR_REVIEW',
      processingStage: 'REVIEW',
      labels: LABELS,
    });

    expect(steps.every((s) => s.state === 'complete')).toBe(true);
  });

  it('maps error phases to user-facing steps', () => {
    expect(errorPhaseToProcessingStep('CLASSIFICATION')).toBe('classification');
    expect(errorPhaseToProcessingStep('VALIDATION')).toBe('data_preparation');
    expect(errorPhaseToProcessingStep('STORAGE')).toBe('file_stored');
  });
});
