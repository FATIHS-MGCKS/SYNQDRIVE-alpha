# SynqDrive public landing page

Static coming-soon site for `https://synqdrive.eu`.

## Runtime boundary

- `synqdrive.eu` is hosted as a static website on Hostinger.
- `app.synqdrive.eu` is the separate SynqDrive SaaS application on the production VPS.
- Deploying this directory must never modify the `app` DNS records or the VPS release.

## Assets

The deployment archive places these existing brand assets beside the landing page files:

- `frontend/src/assets/synqdrive-logo-new.png`
- `frontend/public/sqd-favicon.png`

The page intentionally has no build process and no third-party runtime dependencies. It uses semantic HTML, native CSS, and a small IntersectionObserver enhancement with a reduced-motion fallback.

## Deployment

Create a flat archive containing:

- `landingpage/index.html`
- `landingpage/styles.css`
- `landingpage/script.js`
- the two brand assets listed above

Deploy the archive to the Hostinger website for `synqdrive.eu` with the static website deployment API. Verify the root domain after deployment and confirm separately that `https://app.synqdrive.eu/api/v1/health` remains healthy.
