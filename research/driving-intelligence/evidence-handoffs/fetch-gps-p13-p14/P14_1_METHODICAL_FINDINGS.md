# P14.1 Methodical Findings (mandatory handoff)

Source: `reports/ds4-rpm-p14-1-position-mismatch-forensics.json` (offline, no new Fetch).

## METHODOLOGICAL_COMPARABILITY_VERDICT

**NOT EQUIVALENT** — Treating Fetch archived `dimo.status` **`header.time`** (second-aligned) as co-temporal with SynqDrive S3A **GraphQL bucket labels** in the sealed S4 pin is **not** secured physical simultaneity.

Evidence class: **CODE_PROVEN** (SynqDrive `DI_V0_POSITION_QUERY_SPEC_V0_1`: row timestamp is a 1s bucket label, not proven physical observation time; AVG may differ from any single sample).

This verdict does **not** prove that observations were physically taken at different times. It proves the **comparison contract** used in P14 cannot establish co-temporal fixes.

## ACTUAL_MISMATCH_ROOT_CAUSE

**UNRESOLVED** at per-meter physical level.

The ~**1014 m** mean haversine (0/30 within 75 m) remains **causally unexplained** without Tier-B raw pairs.

Ranked hypotheses (from P14.1, not re-litigated here):

1. Invalid cross-plane pairing + label-time join (strongest documented)
2. Fetch archive vs Telemetry GraphQL pin (no CloudEventID in S4)
3. R1 grid/misdating on telemetry family (hypothesis)
4. Decode defect (not observable — raw payloads not saved)

**Not accepted as sole explanation:** ordinary 1s AVG at typical driving speeds alone.

## Constraints for downstream team

- No best-fit time offset as physical truth.
- No DS4 speed quality upgrade from DIMO path agreement alone.
- Historical R1 RPM pairing veto unchanged.
