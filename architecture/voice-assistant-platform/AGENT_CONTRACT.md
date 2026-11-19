# Voice Assistant Platform — Agent Contract (partial)

- **Domain:** Core — inject `VOICE_BOOKING_READ_PORT` in MCP gateway consumers, not `BookingsService`.
- **Writes:** MCP write tools remain approval/confirmation gated; this port changes **read** dependencies only.
- **Promotion:** Voice Assistant Platform remains `AUDIT_IN_PROGRESS` until `MODULE_AUTHORITY_STANDARD.md` promotion gate is met.