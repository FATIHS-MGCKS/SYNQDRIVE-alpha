# Production White-Screen Incident — 2026-08-20

**Incident window:** 2026-08-20 ~20:12 UTC (post Dashboard Attention V2 deploy)  
**Investigation time:** 2026-08-20 21:24–21:50 UTC  
**Severity:** **High** (affected users cannot use app until cache cleared or hotfix deployed)  
**Rollback executed:** **No**  
**Hotfix PR:** #1087 (not deployed)

---

## 1. Incident timeline

| Time (UTC) | Event |
|------------|-------|
| 20:04–20:12 | Controlled deploy of `main` @ `5374d57a` → release `20260820200447_v4994` (PR #1085 acceptance deploy) |
| ~20:12+ | Operator on **iPhone Safari** opens `https://app.synqdrive.eu` — **complete white page** (no login, no shell) |
| 21:24 | Incident investigation started |
| 21:45 | Root cause identified: stale HTML + SPA fallback serves HTML for missing `/assets/*.js` |
| 21:50 | Hotfix PR #1087 opened (not deployed) |

---

## 2. Production releases

| | Before incident deploy | Incident deploy (current) |
|---|------------------------|---------------------------|
| **Release path** | `/opt/synqdrive/releases/20260818222804_v4994` | `/opt/synqdrive/releases/20260820200447_v4994` |
| **Git SHA** | `e25a7ffd25a4b21ade877d83abb79413d2d3389b` | `5374d57a51a5f1747595edaa5195b3cd6ee13e2d` |
| **Bundle** | `index-Bn0ZPwNs.js` | `index-CReXEAQK.js` |

**End of investigation:** still on `20260820200447_v4994` / `5374d57a` (no rollback).

---

## 3. Operator symptom

- Safari loads `app.synqdrive.eu`
- Background visible, **no login**, no spinner, no UI
- Matches **React never mounting** after module script failure

---

## 4. Reproduction results

| Scenario | Result |
|----------|--------|
| Production root, desktop 1280×800, clean context | **Login renders** — not universally broken |
| Production root, mobile 390×844 (Safari UA) | **Login renders** |
| Hard reload / incognito-like | **Login renders** |
| **Stale bundle simulation** (load `/assets/index-Bn0ZPwNs.js` as module) | **White screen** — fatal MIME error |

**Classification:** **Not** a universal pre-auth failure. **Yes** — failure when cached HTML references a **removed hashed bundle** and server returns **HTML instead of JS**.

iOS Safari automation unavailable natively; mobile viewport reproduced login successfully in Chromium. Operator report consistent with **Safari aggressive cache** of pre-deploy HTML.

---

## 5. First fatal console error (proven)

```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.
```

| Field | Value |
|-------|-------|
| **Type** | Module script / MIME type failure (browser-enforced) |
| **Resource** | `/assets/index-Bn0ZPwNs.js` (previous release bundle) |
| **Server response** | `Content-Type: text/html; charset=UTF-8` (761 bytes — `index.html`) |
| **Bundle in error** | Previous hash `index-Bn0ZPwNs.js` |

---

## 6. DOM / React root findings

| Check | Stale-bundle failure case |
|-------|---------------------------|
| `#root` exists | Yes (in HTML) |
| `#root` childElementCount | **0** |
| React mounted | **No** (Case **A** — never mounted) |
| CSS hiding content | **No** — JS never executed |

Fresh production load: `#root` childElementCount **1**, title `Rental Operations – SynqDrive`.

---

## 7. Network findings

### Current HTML (`GET /`)

- References **`/assets/index-CReXEAQK.js`** + `index-CUqEvJnY.css`
- `Cache-Control: public, max-age=0`

### New bundle `index-CReXEAQK.js`

| Check | Result |
|-------|--------|
| HTTP | **200** |
| Content-Type | **`application/javascript`** |
| Size | ~14.8 MB |
| Complete | Yes |

### Old bundle `index-Bn0ZPwNs.js` (still requested by stale HTML)

| Check | Result |
|-------|--------|
| HTTP | **200** (misleading) |
| Content-Type | **`text/html; charset=UTF-8`** |
| Body | `<!doctype html>…` (SPA fallback) |

**This is the concrete failure.**

---

## 8. Cache / release asset mismatch

| Verdict | **Confirmed** — stale HTML + wrong asset response |
|---------|-----------------------------------------------------|
| HTML references current bundle | Yes (for fresh `GET /`) |
| Old bundle still reachable | Yes — but as **HTML**, not JS |
| CDN separate from nginx | No evidence; nginx proxies to Nest on `:3001` |
| Service worker | **None** registered |
| Layer serving stale HTML | Browser cache (Safari) + weak `max-age=0` on HTML |

Not merely “probably cache” — **proved** by fetching old bundle URL and receiving HTML.

---

## 9. Production server configuration

- Nginx: `location /` → `proxy_pass http://127.0.0.1:3001`
- Nest `ServeStaticModule`: `rootPath: public`, `renderPath: *` (default)
- Missing file under `/assets/` → `express.static` fallthrough → **`app.get('*')` sends `index.html`**

Symlink correct: `/opt/synqdrive/current` → `20260820200447_v4994`.

---

## 10. Local exact-SHA reproduction (`5374d57a`)

```bash
git checkout 5374d57a
cd frontend && npm ci && VITE_NOTIFICATIONS_V2=on npm run build
serve backend/public → Playwright → root childCount=1, no fatal errors
```

**Does exact SHA white-screen locally?** **NO**

---

## 11. Previous SHA (`e25a7ffd`)

Same local smoke: **boots successfully** (root childCount=1).

**Regression boundary valid for JS code?** **NO** — both SHAs boot. Issue is **deploy/static-serving**, not Dashboard Attention merge.

**Git bisect:** **Not performed** (not a commit-level JS regression).

---

## 12. Notification V2 isolation (local only)

| Build flag | Local boot |
|------------|------------|
| `VITE_NOTIFICATIONS_V2=on` | **OK** |
| `VITE_NOTIFICATIONS_V2=off` | **OK** |

**Relationship:** **None** — not a V2 runtime error. Flags unchanged in production.

---

## 13. Circular dependency / i18n audit

No boot-time `Cannot access before initialization` observed in local Playwright smoke on `5374d57a`. No proven ES module cycle causing this incident. **Not the primary cause.**

---

## 14. Root cause (primary, proven)

**NestJS `@nestjs/serve-static` SPA fallback serves `index.html` for missing hashed bundles under `/assets/*.js`.**

After a Vite deploy changes the content hash, clients with **cached HTML** still request the **old bundle**. The server responds with **HTML (200)**, the browser rejects it as an ES module (**strict MIME checking**), React never mounts → **white screen**.

Contributing factor: **`index.html` cache policy** (`max-age=0` only) insufficient for Safari; no `no-store` on HTML.

---

## 15. Rollback decision

| Criterion | Assessment |
|-----------|------------|
| Broad white screen | **No** — fresh loads work |
| Confirmed fatal JS regression in SHA | **No** |
| Previous release boots | Yes |
| Safe immediate code fix | Hotfix ready (#1087) |

**Rollback not executed.** Rollback would restore old bundle file for cached users but **does not fix** the underlying SPA-fallback defect and would block P3 code.

---

## 16. Hotfix

**PR #1087:** Exclude `/assets/(.*)` from SPA fallback; `no-cache, no-store, must-revalidate` on `index.html`.

**Not deployed** during this investigation.

---

## 17. PR #1085 status

Rollout acceptance **blocked**. Real operator white-screen supersedes prior YELLOW deploy sign-off. Do **not** merge #1085 as GREEN until hotfix deployed and operator re-verification complete.

---

## 18. Current production state (end of investigation)

| Item | Value |
|------|-------|
| Release | `20260820200447_v4994` |
| SHA | `5374d57a51a5f1747595edaa5195b3cd6ee13e2d` |
| Bundle | `index-CReXEAQK.js` |
| Health | 200 OK |
| Fresh visual smoke | Login page renders (desktop + mobile viewport) |
| Stale-cache users | **Still broken** until hard refresh or hotfix |

---

## 19. Final incident verdict

### **ORANGE — ROOT CAUSE FOUND / HOTFIX PENDING**

Production is healthy for **fresh** clients. **Affected operators with stale cached HTML remain broken** until they hard-refresh or hotfix #1087 is deployed.

---

## 20. Recommended next actions

1. **Review and deploy PR #1087** via standard VPS release (after human review).
2. **Operator comms:** hard refresh Safari (close tab, reopen) or Settings → Safari → Clear Website Data for `app.synqdrive.eu`.
3. **Re-run pilot dashboard acceptance** after hotfix + operator verification.
4. **Do not merge PR #1085** until post-hotfix sign-off.

---

*End of incident audit.*
