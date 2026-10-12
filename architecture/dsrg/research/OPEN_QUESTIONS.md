# DSRG — Open questions

| Question | Owner | Status |
|----------|-------|--------|
| When is P4B16 deploy attestation automation required before `AUTHORITY_ACTIVE`? | DSRG + VO5C | OPEN — documented in ROADMAP |
| Does live Gate-6 remain KILLED after main advances past DSRG-02 seal? | EXP021 / DI ops | **Resolved R3** — `KILLED` confirmed via `di_v0_s4_control` (see R3 audit) |
| Can cloud-agent deploy path invoke pinned runner exclusively without bypass? | DSRG | OPEN — document in future decision |
| What is the canonical negative test matrix for enforcement go-live? | Security + SRE | OPEN — DSRG-DEC-003 |
| When is `BREAK_GLASS_READY` evidenced for enforcement activation? | DSRG + Security | **OPEN** — prerequisites BG-A–F in `OS_PRIVILEGE_BOUNDARY.md` / `ROLLBACK_AND_CONTAINMENT.md`; drill BG-E **not run** in R4; status **NOT_VERIFIED** |
| Does CI graph bootstrap (`npm ci --prefix architecture/dsrg/scripts` on `GITHUB_ACTIONS` only) require workflow governance approval? | DSRG | **Resolved R4** — no `.github/workflows` change; bootstrap stays inside `validate-graph.sh` with explicit log line |
| Should health/readiness expose per-replica build SHA for attestation observers? | DSRG / Platform | **OPEN** — R1A defines manifest contract lib only; HTTP endpoint not deployed |
| What is the authoritative source when release `.git` is absent? | DSRG | **OPEN** — R0: git present on current release; design requires immutable `RELEASE_MANIFEST_SHA` at clone time |
