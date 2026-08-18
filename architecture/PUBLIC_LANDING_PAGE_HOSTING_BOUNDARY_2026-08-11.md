# Public landing page hosting boundary

Date: 2026-08-11, revised 2026-08-12

The public site and the product application are two separate surfaces on two domains, deployed by
two independent paths, and they live in two repositories. This record exists so that boundary stays
written down here, in the product repository, where a change to `app.synqdrive.eu` could otherwise
break the public site or the other way round.

## The boundary

| Surface | Runtime | Deployment path | Source |
| --- | --- | --- | --- |
| `synqdrive.eu` | Hostinger static hosting | Hostinger static website deployment API | [`FATIHS-MGCKS/SynqDrive-Landing-Page`](https://github.com/FATIHS-MGCKS/SynqDrive-Landing-Page) |
| `app.synqdrive.eu` | SynqDrive frontend and backend on the production VPS | VPS release via `.cursor/scripts/cloud-agent-deploy.sh` | this repository |

Rules that follow from it:

- A public landing-page deployment must not change the `app` A or AAAA records, the VPS release, or
  application routing.
- A product deployment must not touch the `synqdrive.eu` Hostinger website.
- Deploy only to the Hostinger website whose domain matches `synqdrive.eu` exactly.
- After a landing-page deployment, confirm `https://app.synqdrive.eu/api/v1/health` is still healthy.
- The public site has no backend dependency. It reaches `info@synqdrive.eu` through plain mail links
  and adds no tracking, form submission, cookies, API calls, or tenant-scoped behaviour. Keep it
  that way: anything else would put the public surface inside the product's blast radius.

## What lives where

The landing page — templates, content, stylesheet, script, build tooling, committed image assets and
its own QA suite — is entirely in the landing repository. Its build output is the deployment archive.
Nothing about the public site is built from this repository, and **this repository holds no
deployable public page**; a second one here would be a stale surface that could go live by mistake.

Product media on the landing page are real SynqDrive screenshots rendered against synthetic demo
data, never production or customer data. They are curated by hand in the landing repository, where
the committed `assets/` are the source of truth for what is live. Keep that constraint when
replacing them.

Implementation detail for the site itself is documented in the landing repository, in
`docs/IMPLEMENTATION.md` and its `README.md`, not here.

## History

`synqdrive.eu` first served a static coming-soon page, deployed 2026-08-11 straight from
`cursor/professional-coming-soon-c50c` without that branch ever being merged. The full landing page
superseded it a day later. The coming-soon page is preserved as the rollback payload at
`rollback/coming-soon-2026-08-11/` in the landing repository — its `index.html` is byte-identical to
the snapshot archived from the live site before the replacement, so it remains a working emergency
target. That branch's PR was closed rather than merged, because merging it would have recreated a
`landingpage/` directory here, conflict-free and therefore with nothing to warn anyone.

The boundary in this record predates the extraction and is unchanged by it. Only the source and
build of the payload behind `synqdrive.eu` moved.

## In-app records

`frontend/src/master/components/ArchitekturView.tsx` carries a `Public Landing Page Hosting`
integration entry, and `ChangesView.tsx` carries v4.9.895, so the split is visible inside Master
Admin as well as here.
