# Mistral OCR Adapter (2026-07-10)

## Changes

- Added isolated `MistralOcrService` at `backend/src/modules/ai/providers/mistral/`.
- Shared `MistralSdkClientProvider` — single lazy Mistral SDK client for chat/JSON and OCR.
- OCR via official SDK: `client.ocr.process(OCRRequest, { timeoutMs })`.
- Private document transfer: base64 data URLs (`document_url` for PDF, `image_url` for images).
- Typed `MistralOcrError` with code, safeMessage, retryable, stage=OCR.
- Config: `MISTRAL_OCR_MODEL`, `MISTRAL_OCR_TIMEOUT_MS`, `MISTRAL_OCR_MAX_FILE_BYTES`.

## Architektur

```
Buffer + mimeType → MistralOcrService.process()
  → buildOcrDocument() (private data URL)
  → client.ocr.process({ model, document, tableFormat: markdown, includeImageBase64: false })
  → normalizeOcrResponse() → fullText with --- PAGE n --- markers
```

- No classification, extraction, or apply logic in this adapter.
- `DocumentExtractionProcessor` not yet wired — next integration step.

## SDK

- Package: `@mistralai/mistralai@1.15.1` (no upgrade required — OCR endpoint present).
