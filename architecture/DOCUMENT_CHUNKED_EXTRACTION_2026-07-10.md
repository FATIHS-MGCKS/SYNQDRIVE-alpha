# Document Chunked Extraction — V4.9.327

## Removed truncation

| Location | Before | After |
|----------|--------|-------|
| `document-ai-extraction.schema.util.ts` | `rawText.slice(0, 12000)` | Full chunk text only (pre-sized by chunker) |

## Chunking algorithm

1. Build page units from `DocumentPageBlock[]` (OCR pages, PDF text-layer pages, TXT logical sections).
2. Oversized single pages split on paragraph boundaries; markdown tables kept intact.
3. Greedy pack consecutive pages until `targetChars`; flush before exceeding.
4. If chunk count > `maxChunks`: deterministic selection (first, last, evenly spaced middle).
5. If page count > `maxPages`: fail with explicit `MAX_PAGES` (no silent drop).

Token estimate: `ceil(chars / 3.5)` — conservative, no tokenizer dependency.

## Limits (config)

| Env | Default |
|-----|---------|
| `DOCUMENT_EXTRACTION_CHUNK_TARGET_CHARS` | 6000 |
| `DOCUMENT_EXTRACTION_CHUNK_MAX_CHARS` | 8000 |
| `DOCUMENT_EXTRACTION_CHUNK_MAX_PAGES` | 200 |
| `DOCUMENT_EXTRACTION_CHUNK_MAX_CHUNKS` | 12 |
| `DOCUMENT_EXTRACTION_CHUNK_OVERLAP_CHARS` | 0 |

## Merge rules

- Identical normalized values → single `selectedValue`, union `sourcePages`.
- Null ignored when a real value exists.
- Conflict on critical fields (`odometerKm`, `eventDate`, `vin`, …) → `selectedValue = null`.
- Non-critical string conflicts → deterministic winner (lowest page, then chunk index).
- Nested keys merged leaf-by-leaf.
- Evidence stored in `plausibility.extractionEvidence` / `extractionConflicts` (additive; `extractedData` unchanged shape).

## Conflict presentation

| Field | Plausibility status |
|-------|---------------------|
| `odometerKm`, `vin`, `licensePlate` | BLOCKER |
| Other conflicts | WARNING |
| Chunk limit exceeded | WARNING (`DOCUMENT_CHUNK_LIMIT`) |

Source pages included in conflict messages when available.
