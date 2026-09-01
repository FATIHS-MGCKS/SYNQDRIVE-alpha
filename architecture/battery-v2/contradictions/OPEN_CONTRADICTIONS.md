# Battery V2 — Open Contradictions

**Bootstrap state:** No explicit contradictions recorded.

When two sources disagree, create `BAT-V2-CONTRA-*` node and list here — **do not silently resolve**.

## Template

```markdown
## BAT-V2-CONTRA-XXXX

| Source A | Claims |
| Source B | Claims |
| Impact | Which graph nodes affected |
| Resolution status | UNRESOLVED | UNDER_INVESTIGATION | ACCEPTED_AS_HISTORICAL |
```

## Known tension (not yet elevated to contradiction)

- Architecture memo states "publication=false, readiness=false" while production `backend.env` may set `BATTERY_V2_REST_SHADOW_ENABLED=true` — these are **different flags**, not a contradiction. Verify environment evidence separately.
