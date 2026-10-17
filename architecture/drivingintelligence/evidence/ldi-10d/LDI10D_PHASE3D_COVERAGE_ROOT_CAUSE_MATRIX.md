# Coverage / root-cause matrix

| Cause | Layer | Bucket impact | Recoverable (research only) |
| --- | --- | --- | --- |
| PROVIDER_ROW_ABSENT | PROVIDER | 269 | no |
| QC_NO_NUMERIC_OR_UNTRUSTED | QC | 78 | hypothesis |
| L3_SUPPORT_WINDOW_GAPS | ALGORITHM | 13 | hypothesis |
| FROZEN_COORDINATE_HOLD | ALGORITHM | 0 | no |

Estimated irrecoverable buckets (provider absent + frozen): **269**
Estimated potentially shiftable by policy/algorithm (not measured): **91**
