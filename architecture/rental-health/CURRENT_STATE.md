# Rental Health — Current State (bootstrap)

**Epistemic:** INVENTORY only in PR-0 — implementation paths under rental health / fleet health to be audited in a follow-up slice.

**Invariant:** Rental Health **aggregates** module outputs; it does not own driving behaviour assessment. DS4 migration must not route DS4 shadow or assessment tables into rental gate semantics without explicit owner decision and Tires authority promotion gates.
