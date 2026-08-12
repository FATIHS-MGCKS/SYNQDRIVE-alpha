# Public landing page hosting boundary

Date: 2026-08-11, revised 2026-08-12

## Change

The public root domain `synqdrive.eu` serves a static site with no backend dependency, deployed
directly to the existing Hostinger website. It is a separate surface from the product application.

This record was written for the coming-soon page that first established the boundary. That page
shipped to `synqdrive.eu` on 2026-08-11 from `cursor/professional-coming-soon-c50c` without being
merged to `main`, and was superseded on 2026-08-11/12 by the full public landing page. The
**boundary below is unchanged and still governs the surface**; only the payload behind it changed.
The superseded parts are marked as such rather than deleted, because the boundary is the reason
this record exists and it is the only place the split is written down.

See `architecture/PUBLIC_LANDING_PAGE_2026-08-11.md` for the site that is live now.

## Architecture

| Surface | Runtime | Deployment path |
| --- | --- | --- |
| `synqdrive.eu` | Hostinger static hosting | Hostinger static website deployment API |
| `app.synqdrive.eu` | SynqDrive frontend and backend on the production VPS | Existing VPS release deployment |

The two surfaces have independent runtime and deployment paths. A public landing-page deployment
must not change the `app` A or AAAA records, the VPS release, or application routing.

**Source of the deployment archive — superseded 2026-08-12.** The archive was originally assembled
by hand from `landingpage/{index.html,styles.css,script.js}` plus the canonical logo and favicon
copied out of the product frontend. It is now the build output of the standalone repository
`FATIHS-MGCKS/SynqDrive-Landing-Page`; `landingpage/` no longer exists in this repository and the
brand assets are committed in that one. The archive is still flat and still uploaded through the
same Hostinger API, so the boundary itself is untouched.

The static site contacts `info@synqdrive.eu` only through explicit mail links. It does not add
tracking, form submission, cookies, API calls, or tenant-scoped application behavior. This holds
for the current landing page as well.

## Verification

1. Validate the static archive locally at desktop and mobile widths.
2. Deploy only to the Hostinger website whose domain exactly matches `synqdrive.eu`.
3. Verify the root-domain title, key copy, responsive layout, and email action.
4. Confirm `https://app.synqdrive.eu/api/v1/health` remains healthy after the landing-page
   deployment.

## Predecessor page

The coming-soon page this record was written for is preserved as the rollback payload at
`rollback/coming-soon-2026-08-11/` in the landing repository. Its byte-identical live state was
archived from `synqdrive.eu` before the current page was deployed, so it remains a working
emergency target for step 2 above. Its source is deliberately **not** kept in this repository: a
second deployable public page here would be a stale surface that could go live by mistake.
