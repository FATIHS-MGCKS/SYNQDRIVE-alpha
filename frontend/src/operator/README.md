# Operator App (field / tablet)

Mobile-first operator surface for pickups, returns, damages, and vehicle checks.

## Device & layout strategy (V4.9.857)

Capability detection lives in `lib/operatorDeviceCapabilities.ts` — **not a security boundary**.

- **Field mode** (default): phones, tablets, touch terminals, iPad+keyboard, Surface, landscape tablets, zoomed viewports.
- **Desktop fallback**: wide mouse-primary desktops (≥1280px, no touch) show a centered ~430px shell + warning banner — app remains reachable.
- **Split layouts** (`useOperatorTabletLayout`): viewport ≥768px, independent of coarse-pointer heuristics.
- **Camera**: `useOperatorCameraCapture` — file/gallery upload always available; camera button falls back to file picker when `getUserMedia` is unavailable.

Override for local dev: `VITE_ALLOW_OPERATOR_DESKTOP=true` forces field layout on desktop.

Auth/roles: `OperatorAccessGuard` only — never derive permissions from device detection.

## Wiring

Wire placeholders in `OperatorShell` to existing handover, damage, and task flows — no duplicate backends.
