# Public landing page hosting boundary

Date: 2026-08-11

## Change

The public root domain `synqdrive.eu` now serves the version-controlled static coming-soon page from `landingpage/`. Its HTML, CSS, and JavaScript have no backend dependency and are deployed directly to the existing Hostinger website.

## Architecture

| Surface | Runtime | Deployment path |
| --- | --- | --- |
| `synqdrive.eu` | Hostinger static hosting | Hostinger static website deployment API |
| `app.synqdrive.eu` | SynqDrive frontend and backend on the production VPS | Existing VPS release deployment |

The two surfaces have independent runtime and deployment paths. A public landing-page deployment must not change the `app` A or AAAA records, the VPS release, or application routing.

The deployment archive is assembled from:

- `landingpage/index.html`
- `landingpage/styles.css`
- `landingpage/script.js`
- the canonical logo `frontend/src/assets/synqdrive-logo-new.png`
- the canonical favicon `frontend/public/sqd-favicon.png`

The static site contacts `info@synqdrive.eu` only through explicit mail links. It does not add tracking, form submission, cookies, API calls, or tenant-scoped application behavior.

## Verification

1. Validate the static archive locally at desktop and mobile widths.
2. Deploy only to the Hostinger website whose domain exactly matches `synqdrive.eu`.
3. Verify the root-domain title, key copy, responsive layout, and email action.
4. Confirm `https://app.synqdrive.eu/api/v1/health` remains healthy after the landing-page deployment.
