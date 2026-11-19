# Voice Assistant Platform — Current State (partial)

## POST-P6 boundary PR3 (2026-11-19)

| Consumer | Before | After |
|----------|--------|-------|
| `VoiceMcpToolsService` | `BookingsService.findAll` / `findById` | `VOICE_BOOKING_READ_PORT` |
| `VoiceMcpWriteToolsService` | `BookingsService.findAll` / `findById` (read paths only) | `VOICE_BOOKING_READ_PORT` |

Write paths (tasks, support, document email) unchanged.