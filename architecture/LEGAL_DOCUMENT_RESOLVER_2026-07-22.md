# Legal Document Resolver — Architecture Record

**Date:** 2026-07-22  
**Prompt:** 8/32

## Summary

`LegalDocumentResolverService` is the single central resolver for determining which organization legal documents apply to a concrete process context (booking). Resolution is deterministic, tenant-scoped, and returns structured results with selection reasons — never silent language defaults.

## Flow

```
LegalDocumentResolverService.resolve(input)
  ├─ load organization / booking hints
  ├─ buildResolverContext() → evaluatedContext + fallbackDecisions + errors
  ├─ loadCandidates(orgId) — all org legal rows + station junction
  └─ resolveLegalDocuments() — pure engine
       ├─ per documentType: filter ACTIVE + valid + scope match
       ├─ detectResolverConflicts() among matches
       ├─ selectBestCandidate() by priority + id
       └─ missingMandatoryDocuments for unresolved mandatory types
```

## Design decisions

| Decision | Rationale |
|----------|-----------|
| Pure engine separate from Prisma | Comprehensive unit tests without DB |
| Load all org docs, match in memory | Simpler than dynamic Prisma scope queries; acceptable volume per tenant |
| No silent German fallback | `MISSING_LANGUAGE` when neither explicit nor org language |
| `ORGANIZATION_WIDE` matches any station | Via `stationScopesOverlap`; explicit fallback path when station-specific rules miss |
| Conflicts block selection | Same priority + overlapping scope → explicit error, not `findFirst` |
| Existing callers unchanged | Prompt 8 provides API only; bundle migration follows |

## References

- `docs/audits/legal-documents-resolver-2026-07.md`
- `backend/src/modules/documents/legal-document-resolver.service.ts`
