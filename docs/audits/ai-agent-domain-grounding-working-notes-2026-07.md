# SynqDrive AI-Agent — Ist-Audit der Chat-Runtime (Domain Grounding)

| Feld | Wert |
|------|------|
| **Phase** | Prompt 1–2 von 32 — Ist-Audit Chat-Runtime + Telemetrie Source of Truth (read-only) |
| **Datum** | 2026-07-24 (UTC) |
| **Repository** | `https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **HEAD (Audit)** | `f5a5b4e3` — `fix(infra): Nginx HSTS/metrics hardening + CI typecheck drift (V4.9.809)` |
| **Methode** | Statische Code-Analyse, Architektur-/Changelog-Querprüfung, gezielte Unit-Tests (siehe Anhang B). **Keine produktiven Code-Änderungen.** |

> **Scope:** Fleet AI Assistant (Text-Chat im Rental-SPA). Verwandte, aber **separate** Assistenten-Pfade (Voice MCP/ElevenLabs, WhatsApp AI, Document Extraction, Vehicle/Tire Specs, DTC Research) werden als Kontext und Abgrenzung dokumentiert — nicht als Ziel dieser Prompt-Reihe umgebaut.

---

## 1. Komponentenübersicht

### 1.1 Fleet AI Assistant — Primärer Chat-Pfad

| Schicht | Pfad | Klasse / Export | Rolle |
|---------|------|-----------------|-------|
| **Frontend UI** | `frontend/src/rental/components/AIAssistantView.tsx` | `AIAssistantView` | Einzige Produktions-Chat-Oberfläche; lokaler State, SSE-Stream, Markdown-Rendering |
| **Frontend Routing** | `frontend/src/rental/App.tsx` | `currentView === 'ai-assistant'` | View-Switch ohne dedizierte URL-Route |
| **Frontend Navigation** | `frontend/src/rental/components/Sidebar.tsx` | Quick-Action + Nav-Eintrag | Desktop + Mobile-Drawer |
| **Frontend API** | `frontend/src/lib/api.ts` | `api.chat.*`, `streamChatMessage()` | REST + manueller SSE-Parser (POST + `ReadableStream`) |
| **Frontend Tenant** | `frontend/src/rental/RentalContext.tsx` | `useRentalOrg()` → `orgId` | Aktive Organisation aus Login/Org-Switch |
| **Frontend i18n** | `frontend/src/rental/i18n/translations/*.ts` | `aiChat.*`, `nav.aiAssistant` | 8 Locales; Suggestions/Capabilities-Texte |
| **Backend Controller** | `backend/src/modules/ai/chat/chat.controller.ts` | `ChatController` | REST + SSE unter `organizations/:orgId/chat/*` |
| **Backend Service** | `backend/src/modules/ai/chat/chat.service.ts` | `ChatService` | Orchestrierung: Agent-Metadaten, Fleet-Context, LLM, Persistenz |
| **Fleet Context** | `backend/src/modules/ai/chat/fleet-chat-context.util.ts` | `tryResolveVehicle`, `buildEnrichedChatMessage`, `FLEET_CHAT_SYSTEM_PROMPT` | Fahrzeugerkennung + Prompt-Anreicherung |
| **LLM Gateway** | `backend/src/modules/ai/llm/llm-gateway.service.ts` | `LlmGatewayService` | Provider-neutral: `complete`, `stream`, `completeJson` |
| **LLM Types** | `backend/src/modules/ai/llm/llm.types.ts` | `LlmMessage`, `LlmProvider`, … | Inkl. `tool`-Rolle im Typ — **nicht vom Chat genutzt** |
| **Mistral Provider** | `backend/src/modules/ai/providers/mistral/mistral-llm.service.ts` | `MistralLlmService` | Einziger aktiver LLM-Provider (`providerId = 'mistral'`) |
| **Mistral Client** | `backend/src/modules/ai/providers/mistral/mistral-sdk-client.provider.ts` | `MistralSdkClientProvider` | Shared SDK-Client, Timeout 120s |
| **AI Config** | `backend/src/config/ai.config.ts` | `registerAs('ai', …)` | `MISTRAL_*`, `AI_STREAMING_ENABLED`, `AI_EXTERNAL_ACTIONS_REQUIRE_APPROVAL` |
| **AI Module** | `backend/src/modules/ai/ai.module.ts` | `AiModule` | Wiring; exportiert `ChatService`, `LlmGatewayService` |
| **AI Health** | `backend/src/modules/ai/ai-health.controller.ts` | `AiHealthController` | `GET /api/v1/ai/health` — Konfigurationsstatus |
| **App Registration** | `backend/src/app.module.ts` | `AiModule` import | Globaler Throttler: 200 req/min/IP |
| **Datenmodell** | `backend/prisma/schema.prisma` | `OrganizationChatAgent`, `ChatMessage` | Org-scoped Chat-Metadaten + Nachrichten |
| **Tests** | `backend/src/modules/ai/chat/chat.service.spec.ts` | 3 Tests | Agent-Registrierung, Fleet-Enrichment, Config-Fehler |
| **Security Tests** | `backend/src/shared/auth/iam-endpoint-enforcement-triage.security.spec.ts` | ChatController-Guards | `OrgScopingGuard` + `PermissionsGuard` + `ai-assistant` |

### 1.2 Verwandte LLM-Pfade (gleiches Gateway, **nicht** Fleet-Chat)

| Pfad | Service | LLM-Methode | Auth |
|------|---------|--------------|------|
| `backend/src/modules/ai/documents/document-ai-extraction.service.ts` | `DocumentAiExtractionService` | `completeJson` | Job/Org-scoped |
| `backend/src/modules/ai/vehicle-specs/vehicle-spec-ai.service.ts` | `VehicleSpecAiService` | `complete` / `stream` | **Public** (`auth.guard.ts` Bypass) |
| `backend/src/modules/ai/vehicle-specs/tire-spec-ai.service.ts` | `TireSpecAiService` | `stream` | **Public** |
| `backend/src/modules/vehicle-intelligence/dtc-knowledge/dtc-ai-research.service.ts` | `DtcAiResearchService` | `completeJson` | Worker/Queue org-scoped |
| `backend/src/modules/ai/providers/mistral/mistral-ocr.service.ts` | `MistralOcrService` | OCR (kein Chat) | Document-Pipeline |

### 1.3 Parallele Assistenten-Architekturen (bewusst getrennt)

| Surface | Einstieg | LLM? | Tool Calling? | Anbindung an `ChatService` |
|---------|--------|------|---------------|----------------------------|
| **Fleet AI Assistant** | `ai/chat/*` | Mistral (`purpose: chat`) | **Nein** | — |
| **WhatsApp AI** | `whatsapp/*` | **Nein** (Regex + Templates) | Ja — `WhatsAppAiToolsService` | **Explizit nicht** (`whatsapp-ai-tools.service.ts` Kommentar) |
| **Voice Assistant** | `voice-assistant/*` + ElevenLabs | ElevenLabs (extern) | Ja — `voice-mcp-tools.registry.ts` | Nein |
| **Health Summary (AI Care)** | `rental-health/*` | **Nein** (deterministisch) | Nein | Nein |

**WhatsApp AI Kernklassen:**

- `backend/src/modules/whatsapp/whatsapp-ai-router.service.ts` — Intent-Routing, Policy, Audit
- `backend/src/modules/whatsapp/whatsapp-ai-tools.service.ts` — Buchungen, GPS, DTC via `VehiclesService`
- `backend/src/modules/whatsapp/whatsapp-ai-intent.util.ts` — Regex-Klassifikation
- `backend/src/modules/whatsapp/whatsapp-ai-reply.builder.ts` — Template-Antworten (kein LLM)
- `backend/src/modules/whatsapp/whatsapp-ai-context.service.ts` — Operativer Kontext

**Voice MCP Kernklassen:**

- `backend/src/modules/voice-mcp-gateway/voice-mcp-tools.service.ts`
- `backend/src/modules/voice-mcp-gateway/voice-mcp-tools.registry.ts`
- `backend/src/modules/voice-mcp-gateway/voice-mcp-rate-limit.service.ts`
- `backend/src/modules/voice-protection/voice-budget-enforcement.service.ts` — Kostenkontrolle (nur Voice)

### 1.4 Veraltete / doppelte Pfade

| Befund | Details |
|--------|---------|
| **DIMO Agents LLM entfernt** | Kein `DimoAgentsService`, kein `agents.dimo.zone` im aktiven Backend-Code (v4.9.146). Grep über `backend/src/**` liefert 0 Treffer. |
| **Legacy-Feld `dimoAgentId`** | `OrganizationChatAgent.dimoAgentId` speichert jetzt Provider-ID (`mistral` / `unconfigured`), nicht DIMO-Agent-UUID. |
| **Stale Frontend-Copy** | `AIAssistantView.tsx` zeigt „DIMO Agent Connected“, „Powered by DIMO Agents“ — widerspricht Mistral-Architektur. |
| **Stale Docs** | `docs/ai-document-upload.md` referenziert noch „DIMO Agent (JSON)“ — historisch, nicht Fleet-Chat. |
| **Figma-Prototyp** | `frontend/figma-rental/App.tsx` importiert `./components/AIAssistantView` — Datei existiert nicht; kein Produktionspfad. |
| **Ungenutzte API-Client-Methoden** | `api.chat.ensureAgent`, `api.chat.sendMessage` definiert, Frontend ruft sie nicht auf. |
| **Doppelter Transport** | `POST /message` (non-stream) und `POST /message/stream` — gleiche `ChatService`-Logik, Frontend nutzt nur Stream. |

### 1.5 Mock-Daten

- **Keine** Chat-Mocks in Produktionscode.
- Tests: Jest-Mocks für Prisma + `LlmGatewayService` in `chat.service.spec.ts`.
- `ensureAgent` bei fehlendem API-Key: `dimoAgentId: 'unconfigured'` in DB.

---

## 2. Vollständiger Request-/Response-Datenfluss

### 2.1 Sequenzdiagramm (Fleet Chat — Happy Path)

```mermaid
sequenceDiagram
  participant UI as AIAssistantView
  participant API as frontend/lib/api.ts
  participant Auth as AuthGuard (JWT)
  participant Org as OrgScopingGuard
  participant Perm as PermissionsGuard
  participant CC as ChatController
  participant CS as ChatService
  participant FCU as fleet-chat-context.util
  participant DB as Prisma (Vehicle, ChatMessage)
  participant LGW as LlmGatewayService
  participant M as MistralLlmService
  participant MA as Mistral API

  UI->>API: streamChatMessage(orgId, content)
  API->>CC: POST /api/v1/organizations/:orgId/chat/message/stream<br/>Authorization: Bearer JWT
  Auth->>Auth: JWT validieren
  Org->>Org: :orgId ∈ User-Membership + JWT claim
  Perm->>Perm: ai-assistant:write
  CC->>CC: SSE-Header setzen
  CC->>CS: streamMessage(orgId, content, emit, isClosed)
  CS->>CS: ensureAgentSafe() → ensureAgent()
  CS-->>UI: SSE event: status { agentReady: true }
  CS->>DB: chatMessage.create(role=user)
  CS->>DB: vehicle.findMany({ organizationId: orgId })
  CS->>FCU: tryResolveVehicle + buildEnrichedChatMessage
  CS->>LGW: stream({ purpose: chat, messages: [system, user] })
  LGW->>M: client.chat.stream()
  M->>MA: mistral-large-latest (default)
  loop Token-Deltas
    MA-->>M: stream chunks
    M-->>LGW: onEvent(delta)
    LGW-->>CS: onChunk
    CS-->>UI: SSE event: progress { type: token, content }
  end
  M-->>CS: accumulated content
  CS->>DB: chatMessage.create(role=assistant)
  CS-->>UI: SSE event: result { id, role, content, createdAt }
```

### 2.2 API-Endpunkte (`ChatController` @ `organizations/:orgId/chat`)

Basis: `/api/v1` (globaler Nest-Prefix)

| Methode | Route | Permission | Request | Response |
|---------|-------|------------|---------|----------|
| `GET` | `/agent` | `ai-assistant:read` | — | `{ agent: { agentName, dimoAgentId, createdAt } \| null, messageCount }` |
| `POST` | `/agent` | `ai-assistant:write` | `{}` | `{ agentName, dimoAgentId }` |
| `POST` | `/message` | `ai-assistant:write` | `{ content: string }` | `{ id?, role: 'assistant', content, createdAt }` |
| `POST` | `/message/stream` | `ai-assistant:write` | `{ content: string }` | **SSE** (siehe 2.3) |
| `GET` | `/history?limit&before` | `ai-assistant:read` | `limit` default 100 | `[{ id, role, content, createdAt }]` |
| `DELETE` | `/history` | `ai-assistant:write` | — | `{ cleared: true }` |

**Zusätzlich:** `GET /api/v1/ai/health` — **ohne** `@UseGuards` auf Controller-Ebene; liefert nur `{ configured, provider, activeProviderId, streamingEnabled }`.

### 2.3 SSE-Event-Schema (`POST .../message/stream`)

| Event | Payload | Frontend-Verarbeitung |
|-------|---------|----------------------|
| `status` | `{ agentReady: boolean }` | Setzt `agentReady` |
| `progress` | `{ type: 'token', content: string }` | Setzt `thinkingLabel` — **kein inkrementelles Rendering** |
| `result` | `{ id?, role, content, createdAt }` | Vollständige Assistant-Nachricht anhängen |
| `error` | `{ message: string }` | Als Assistant-Bubble mit Fehlertext |

**Streaming-Implementierung:**

- Backend: `ChatController.streamMessage` → `res.write('event: …\ndata: …\n\n')`
- Frontend: `streamChatMessage()` — POST + `fetch` + manueller SSE-Parser (nicht `EventSource`)
- `AI_STREAMING_ENABLED=false`: `LlmGatewayService.stream()` emuliert Stream via einmaligem `complete()`
- Frontend wartet auf `result` — Progress-Tokens werden nur als „Denke nach…“-Label genutzt, nicht als Live-Typing

### 2.4 Auth-, Mandanten- und Rechtefluss

```
JWT (AuthGuard global)
  → OrgScopingGuard (:orgId ∈ Membership, JWT claim match; MASTER_ADMIN Pass-through)
    → PermissionsGuard (Modul ai-assistant: read|write)
      → RolesGuard (kein @RequireRole auf Chat-Handlern)
        → ChatService (alle DB-Queries mit organizationId aus Route)
```

| Prüfung | Implementierung | Bewertung |
|---------|-----------------|-----------|
| Tenant-Isolation Route | `OrgScopingGuard` auf `ChatController` | ✅ Gehärtet (Security-Spec bestätigt) |
| Tenant-Isolation DB | `vehicle.findMany({ where: { organizationId: orgId } })`, `chatMessage.*` scoped | ✅ |
| Permission-Modul | `permission.constants.ts`: `'ai-assistant'` | ✅ Backend erzwingt |
| Default-Rollen | `organization-role.defaults.ts` — Admin/Manager enthalten `ai-assistant` | ✅ |
| Frontend Nav-Gate | Sidebar zeigt AI ohne `hasPermission`-Check | ⚠️ UI-only Gap |
| `GET /ai/health` | Unauthenticated | ⚠️ Nur Metadaten, keine Secrets |
| Vehicle Specs AI | Public auth bypass | ⚠️ Separater Pfad; `dimoVehicle.findFirst` ohne `organizationId` |

### 2.5 Fehler- und Fallback-Verhalten

| Bedingung | Verhalten | HTTP / SSE |
|-----------|-----------|------------|
| Leere Nachricht | Fest codiert: „Please enter a message to get started.“ | 200 / SSE `result` |
| `MISTRAL_API_KEY` fehlt | User-Message + persistierte Assistant-Antwort mit Config-Hinweis | 200 / SSE `result` |
| `ensureAgent` Fehler | Generische Verbindungsfehler-Message | 200 / SSE `result` |
| LLM-Exception | `sanitizeChatError()` — Bearer/sk redacted, max 300 Zeichen | User-facing Apology in `result` |
| Controller unhandled | Catch → Assistant-Error-Message | Kein HTTP 500 an Client |
| Prisma save failure | `.catch(() => {})` — **still** | Antwort kann ohne DB-ID zurückkommen |
| Stream-Verbindungsabbruch | Frontend `onDone` ohne `result` → „connection issue“ | Client-seitig |
| LLM liefert leer | `'No response received.'` | Persistiert |

**Hardcoded Fallback-Strings (Frontend, Englisch):**

- `AIAssistantView.tsx`: Verbindungsfehler, generischer Error, `onDone`-Fallback
- Thumbs up/down: **keine Handler** (dekorativ)

---

## 3. Aktuelle System-Prompts

### 3.1 Fleet Chat — `FLEET_CHAT_SYSTEM_PROMPT`

**Datei:** `backend/src/modules/ai/chat/fleet-chat-context.util.ts`

```
You are SynqDrive Fleet Assistant — a helpful AI for fleet and rental operators.
Answer clearly and practically. Do not invent vehicle telemetry, odometer readings, or live DIMO data you were not given.
When fleet context is attached, use it to identify which vehicle the user means.
Prefer German when the user writes in German.
```

### 3.2 Fleet Chat — User-Message-Anreicherung (`buildEnrichedChatMessage`)

Wenn `fleet.length > 0`, wird die User-Nachricht in folgendes Format eingebettet:

```
[Fleet context — {N} registered vehicles:
#1: {make} {model} {year}, plate="...", name="...", VIN=..., tokenId=..., fuel={fuelType}
...
Use this fleet data to identify vehicles when users refer to them by license plate, name, make/model, or VIN. Only reference live telemetry when a specific vehicle with tokenId is resolved.]
{optional resolution hint}
User message: {original user text}
```

**Resolution Hint** (wenn `tryResolveVehicle` matcht):

```
[System: The user is likely referring to vehicle "{make} {model} {year}" (plate: …), tokenId=…. Use this vehicle for data lookups.]
```

Wenn kein `tokenId`:

```
[System: This vehicle has no DIMO tokenId — do not claim live DIMO telemetry for it.]
```

### 3.3 Was **nicht** als System-Prompt existiert

- Kein dynamischer Org-Name / User-Name im System-Prompt
- Keine Rollen-/Rechte-Hinweise für das Modell
- Keine Tool-/Function-Definitionen
- Keine Conversation-History im LLM-Payload
- Keine Live-Telemetrie-, Buchungs-, Finanz- oder Task-Daten

### 3.4 Andere System-Prompts (nicht Fleet-Chat, Referenz)

| Feature | Datei | Zweck |
|---------|-------|-------|
| DTC Research | `backend/src/modules/vehicle-intelligence/dtc-knowledge/dtc-ai-research.schema.util.ts` | Strukturierte JSON-Ausgabe |
| Document Extraction | `backend/src/modules/ai/documents/document-ai-extraction.schema.util.ts` | OCR → JSON Schema |
| Vehicle Specs | `backend/src/modules/ai/vehicle-specs/vehicle-spec-ai.service.ts` (intern) | Spec-Extraktion |
| Voice Assistant | `backend/src/modules/voice-assistant/agent-deployment/*` | ElevenLabs Agent-Prompts |

---

## 4. Aktuelle Daten, die das Modell tatsächlich erhält

### 4.1 Pro Chat-Anfrage an Mistral (`ChatService.callLlm`)

**Message-Array (immer genau 2 Nachrichten):**

```typescript
[
  { role: 'system', content: FLEET_CHAT_SYSTEM_PROMPT },
  { role: 'user', content: enrichedMessage },
]
```

### 4.2 Inhalt von `enrichedMessage`

| Datenquelle | Methode | Felder |
|-------------|---------|--------|
| `vehicle` + `dimoVehicle` | `ChatService.getOrgFleetInfo(orgId)` | `vehicleId`, `licensePlate`, `vehicleName`, `make`, `model`, `year`, `vin`, `fuelType`, `tokenId` |
| Fahrzeugerkennung | `tryResolveVehicle(message, fleet)` | Regex/Substring über Kennzeichen, Name, Make+Model(+Year), VIN, `tokenId` |
| User-Text | Original `content` | Unverändert am Ende der Anreicherung |

### 4.3 Was das Modell **nicht** erhält (trotz UI-Claims)

| Domäne | UI suggeriert (i18n `aiChat.cap.*` / Suggestions) | Backend liefert |
|--------|---------------------------------------------------|-----------------|
| Flottenstatus live | ✅ | Nur statische Fahrzeug-Stammdaten |
| Umsatz / Finanzen | ✅ | ❌ Keine Buchungs-/Invoice-Daten |
| Buchungen heute | ✅ | ❌ |
| Wartung / Health | ✅ | ❌ Keine Health-Module, keine Tasks |
| Kunden | ✅ | ❌ |
| Aufgaben | ✅ | ❌ |
| DIMO Telemetrie | UI: „real-time telemetry“ | ❌ Nur `tokenId`-Hinweis; keine Live-Signale |
| Chat-Verlauf | UI zeigt History | ❌ Vorherige Turns nicht an LLM gesendet |

### 4.4 Persistierte vs. inferierte Daten

| Daten | Gespeichert (`chat_messages`) | An LLM gesendet |
|-------|------------------------------|-----------------|
| User-Nachrichten | ✅ `role=user` | Nur aktuelle Nachricht (enriched) |
| Assistant-Antworten | ✅ `role=assistant` | ❌ Nicht replayed |
| `tokenIds` aus Resolution | ❌ | Nur indirekt im enriched text; `resolveChatVehicleTokenIds` nur für **Logging** |

### 4.5 Modell- und Provider-Konfiguration

| Env-Variable | Default | Verwendung Chat |
|--------------|---------|-----------------|
| `AI_PROVIDER` | `mistral` | Provider-Auswahl in `ai.module.ts` |
| `MISTRAL_API_KEY` | — | Pflicht für `isConfigured()` |
| `MISTRAL_CHAT_MODEL` | `mistral-large-latest` | `purpose: 'chat'` |
| `MISTRAL_BASE_URL` | optional | Custom Endpoint |
| `AI_STREAMING_ENABLED` | `true` | Stream vs. Complete-Fallback |

**Timeout:** 120s (`mistral-sdk-client.provider.ts`)

**Token Usage:** Mistral liefert `usage` in `LlmCompleteResult` — `ChatService` loggt/billt es **nicht**.

---

## 5. Erkannte Risiken

### 5.1 Domain Grounding / Halluzinationsrisiko

| ID | Risiko | Schwere | Evidenz |
|----|--------|---------|---------|
| R1 | **Modell antwortet ohne echte Domänendaten** — Umsatz, Buchungen, Wartung, Tasks werden impliziert unterstützt, Backend liefert nur Fleet-Stammdaten | **Hoch** | UI Capabilities vs. `callLlm` Payload |
| R2 | **Kein Conversation History Replay** — Multi-Turn nur visuell; Modell hat keinen Kontext vorheriger Turns | **Hoch** | `callLlm` sendet nur 2 Messages |
| R3 | **Kein Tool/Function Calling** — keine Live-Abfragen an SynqDrive-Services oder DIMO | **Hoch** | `LlmMessageRole: 'tool'` ungenutzt |
| R4 | System-Prompt verbietet Erfindung, aber ohne Daten kann Modell trotzdem raten | **Mittel** | Prompt allein reicht nicht |
| R5 | `tokenId`-Resolution suggeriert „data lookups“, aber es gibt keine Lookups | **Mittel** | `resolutionHint` Text |

### 5.2 Veraltete Architektur-Referenzen

| ID | Risiko | Schwere | Evidenz |
|----|--------|---------|---------|
| R6 | Frontend behauptet DIMO Agents API | **Mittel** | `AIAssistantView.tsx` Zeilen 322, 354, 564 |
| R7 | API-Feld `dimoAgentId` irreführend | **Niedrig** | Speichert `mistral` |
| R8 | `docs/ai-document-upload.md` DIMO-Agent-Referenzen | **Niedrig** | Separater Flow |

### 5.3 Tenant / Security

| ID | Risiko | Schwere | Evidenz |
|----|--------|---------|---------|
| R9 | Fleet-Chat Tenant-Isolation | **Niedrig (OK)** | Guards + org-scoped Queries |
| R10 | Vehicle Specs: `dimoVehicle.findFirst` ohne `organizationId` | **Mittel** | `vehicle-specs.controller.ts:resolveVehicleParams` — Cross-Tenant tokenId/VIN Lookup |
| R11 | VIN + Kennzeichen aller Org-Fahrzeuge im LLM-Prompt | **Mittel** | Daten an externen Provider (Mistral); DSGVO/Vertraulichkeit |
| R12 | Frontend ohne Permission-Gate | **Niedrig** | API blockt; UX zeigt ggf. Fehler |

### 5.4 Betrieb / Kosten / Nachvollziehbarkeit

| ID | Risiko | Schwere | Evidenz |
|----|--------|---------|---------|
| R13 | **Keine Chat-spezifischen Rate Limits** — nur global 200/min/IP | **Mittel** | `app.module.ts` ThrottlerModule |
| R14 | **Keine Token-/Kosten-Tracking** für Fleet-Chat | **Mittel** | `usage` wird verworfen |
| R15 | **Keine Audit-Trail pro Antwort** (Quellen, Tools, Modell-Version) | **Hoch** | Nur `chat_messages.content` |
| R16 | Stille DB-Persistenz-Fehler | **Mittel** | `.catch(() => {})` in `saveUserMessage` / `persistAssistant` |
| R17 | Feedback (Thumbs) nicht angebunden | **Niedrig** | Keine Handler |
| R18 | `GET /ai/health` unauthenticated | **Niedrig** | Keine Secrets |

### 5.5 Frontend / Mobile (technisch)

| ID | Risiko | Schwere | Evidenz |
|----|--------|---------|---------|
| R19 | **Kein responsives Layout** — feste 260px Sidebar + `max-w-[1400px]` | **Mittel** | Keine `sm:`/`lg:` Breakpoints |
| R20 | Kein inkrementelles Stream-Rendering trotz SSE | **Niedrig** | UX-Latenz wahrnehmbar |
| R21 | Hardcoded englische Fehlertexte trotz DE-i18n | **Niedrig** | `AIAssistantView.tsx` |

### 5.6 Doppelte AI-Pfade (Abgrenzung)

| Pfad | Risiko |
|------|--------|
| WhatsApp AI vs. Fleet Chat | Bewusst getrennt — WhatsApp hat echte Tool-Calls, Fleet Chat nicht |
| Voice MCP vs. Fleet Chat | Voice hat Budget + Rate Limits; Fleet Chat nicht |
| Document/Specs/DTC vs. Fleet Chat | Gleiches Mistral-Gateway, unterschiedliche Auth und Prompts |

---

## 6. Offene Fragen für die nächsten Audit-Prompts

### 6.1 Domain Grounding & Tools

1. Soll Fleet-Chat **Tool Calling** gegen SynqDrive-Domänenservices bekommen (Buchungen, Tasks, Health, Finanzen) — analog WhatsApp `WhatsAppAiToolsService`?
2. Soll **DIMO Telemetrie** über bestehende `VehiclesService`/Snapshot-Pfade eingebunden werden, wenn `tokenId` resolved ist?
3. Wie viel **Conversation History** soll ans Modell (Sliding Window, Summarization, letzte N Turns)?
4. Sollen UI-Capabilities **an Backend-Fähigkeiten gekoppelt** oder bewusst reduziert werden?

### 6.2 Architektur & Migration

5. Wann wird `OrganizationChatAgent.dimoAgentId` → `llmProviderId` migriert / Tabelle bereinigt?
6. Soll `ChatService` mit WhatsApp-/Voice-Tool-Registry **konvergieren** oder getrennt bleiben?
7. Braucht Fleet-Chat einen **eigenen Audit-/Trace-Record** (model, usage, context hash, resolved vehicleIds)?

### 6.3 Security & Compliance

8. Ist die Weitergabe von **VIN/Kennzeichen** an Mistral für alle Tenants akzeptiert (AVV/DPA)?
9. Soll `GET /ai/health` authentifiziert werden?
10. Soll Vehicle-Specs-Public-Bypass (`auth.guard.ts`) org-scoped werden?

### 6.4 Betrieb & Kosten

11. Welche **Rate Limits / Quotas** pro Org/User für Chat?
12. Soll Token-Usage in ein **Usage Ledger** (wie Voice `VoiceBudgetEnforcementService`)?
13. Welches **Modell-Routing** (`router` purpose existiert, wird im Chat nicht genutzt)?

### 6.5 Frontend

14. Wann **DIMO → Mistral/SynqDrive** Copy-Cleanup?
15. **Mobile Layout** — Sidebar collapsible / WhatsApp-Pane-Pattern?
16. **Inkrementelles Streaming** im UI?
17. **Permission-Gate** in Sidebar + `hasPermission('ai-assistant')`?
18. Feedback-Loop (Thumbs) — Speicherung / Fine-tuning Pipeline?

### 6.6 Test & Verifikation

19. Fehlende Tests: `fleet-chat-context.util.ts`, `ChatController` SSE, `streamChatMessage` Frontend?
20. E2E-Test für „Suggestion Umsatz“ → erwartetes „keine Daten“-Verhalten nach Tool-Integration?

---

## Anhang A — Abhängigkeitsgraph (vereinfacht)

```
AIAssistantView
  → useRentalOrg (orgId)
  → api.chat.getAgent | getHistory | clearHistory
  → streamChatMessage
      → POST /organizations/:orgId/chat/message/stream

ChatController
  → ChatService
      → PrismaService (OrganizationChatAgent, ChatMessage, Vehicle, Organization)
      → LlmGatewayService
          → MistralLlmService (LLM_PROVIDER)
              → MistralSdkClientProvider
                  → @mistralai/mistralai SDK
      → fleet-chat-context.util
```

## Anhang B — Statische Prüfungen (ausgeführt)

| Prüfung | Ergebnis |
|---------|----------|
| `npm test --testPathPattern='chat\.service\|iam-endpoint-enforcement-triage'` | 14/14 PASS |
| Grep `DimoAgentsService` / `agents.dimo.zone` in `backend/src` | 0 Treffer |
| Grep `FLEET_CHAT_SYSTEM_PROMPT` | 1 Definition, 1 Verwendung (`chat.service.ts`) |

## Anhang C — Änderungshistorie (relevant)

Aus `frontend/src/master/components/ChangesView.tsx`:

- **v4.9.143–146:** Migration Fleet Chat von DIMO Agents → Mistral `LlmGatewayService`
- **v4.9.146:** Final DIMO Agents cleanup; `GET /api/v1/ai/health` ersetzt `GET /dimo/agents/health`

---

# Prompt 2 — Fahrzeug- & Telemetrie Source of Truth

## 7. Telemetrie-Architektur (Schichtenmodell)

```mermaid
flowchart TB
  subgraph Provider["DIMO (Provider of Record)"]
    GQL["GraphQL Telemetry API<br/>signalsLatest · signals · segments"]
    Identity["Identity API<br/>tokenId · VIN VC"]
    Webhooks["Vehicle Triggers<br/>OBD plug/unplug"]
  end

  subgraph Ingest["Ingest (~30 s)"]
    Sched["DimoSnapshotScheduler<br/>@Interval(30000)"]
    Proc["DimoSnapshotProcessor<br/>normalizeSnapshot → upsert"]
  end

  subgraph PG["PostgreSQL — operative Wahrheit"]
    V["Vehicle — Stammdaten"]
    DV["DimoVehicle — Provider-Spiegel"]
    VLS["VehicleLatestState — Latest Telemetry"]
    Trip["Trip — Segment-Grenzen"]
    Episodes["DeviceConnectionEpisodes"]
  end

  subgraph LiveAPI["On-Demand Live (kein DB-Write)"]
    LiveGps["GET /vehicles/:id/live-gps<br/>fetchLastSeenLocation"]
    TelOverlay["getVehicleWithTelemetry<br/>optional fetchLastSeenLocation"]
  end

  subgraph CH["ClickHouse — Analytics-Spiegel"]
    SnapCH["telemetry_snapshots"]
    HF["telemetry_hf_points/events"]
    WP["telemetry_waypoints"]
  end

  subgraph Cache["Redis / Client"]
    FMCache["fleet-map:{orgId}:v1 — 5 s TTL"]
    Addr["addressService.ts — Mapbox in-memory"]
  end

  GQL --> Proc
  Sched --> Proc
  Proc --> VLS
  Proc --> SnapCH
  Identity --> DV
  Webhooks --> Episodes
  VLS --> FMCache
  VLS --> LiveAPI
  GQL --> LiveAPI
  DV -.->|"lastSignal (sync only, kann laggen)"| VLS
```

### 7.1 Kanonische Schreib- und Lesepfade

| Schicht | Mechanismus | Cadence | Persistenz | Primärer Consumer |
|---------|-------------|---------|------------|-------------------|
| **Snapshot-Poll** | `DimoSnapshotProcessor` → `DimoTelemetryService.fetchLatestVehicleSnapshot` | ~30 s (`DimoSnapshotScheduler`) | `VehicleLatestState` (+ optional CH `telemetry_snapshots`) | Fleet Map, Connectivity, Trip-FSM, Battery V2 |
| **Live-GPS-Proxy** | `VehiclesService.getLiveGps` → `fetchLastSeenLocation` | Frontend 5 s bei Tracking | **Kein DB-Write** | `OverviewLiveMapCard`, `useLiveVehicleTelemetry` |
| **Telemetry-Detail** | `GET /vehicles/:id/telemetry` → `getVehicleWithTelemetry` | Frontend ~30 s | Liest VLS; optional Live-GPS-Overlay | Vehicle Detail (alle Tabs) |
| **Identity-Sync** | `DimoApiSyncService` → `fetchVehicleSummary` | Bei Pairing/Sync | `DimoVehicle.*` Spiegel | Master DIMO-Views, initiale Spiegelung |
| **Segment-Historie** | `DimoSegmentsService` GraphQL `segments` | On-demand / Reconciliation | PostgreSQL `Trip` | Trip Detail, Route, Verhalten |
| **Signal-Historie** | DIMO `signals(interval: …)` innerhalb Trip-Fenster | On-demand | DIMO API (+ CH HF wenn `HF_MIRROR_ENABLED`) | Trip Enrichment, Data Analyse, Battery |
| **Fleet-Map-Bulk** | `GET /fleet-map` → `getFleetMapData` | Redis 5 s Cache | Liest VLS + `deriveFleetStatusContext` | `FleetHubView`, Dashboard |

**Regel:** Für operative UI und Backend-Logik ist **`VehicleLatestState` (geschrieben durch `DimoSnapshotProcessor`) die kanonische Latest-Telemetrie**. ClickHouse ist ein fire-and-forget Analytics-Spiegel — nie für Live-UI. `getLiveGps` ist ein bewusster DIMO-Direktpfad für Sub-30s-Kartenanimation ohne Persistenz.

### 7.2 Zentrale Methoden (verifizierte Namen)

| Methode | Datei | Zweck |
|---------|-------|-------|
| `fetchLatestVehicleSnapshot` | `backend/src/modules/dimo/dimo-telemetry.service.ts` | Vollständiges `signalsLatest` (Snapshot-Poll) |
| `fetchLastSeenLocation` | `backend/src/modules/dimo/dimo-telemetry.service.ts` | Leichtgewicht GPS + Speed (Live-Map) |
| `fetchVehicleSummary` | `backend/src/modules/dimo/dimo-telemetry.service.ts` | Odometer, SOC, Fuel, Speed für Identity-Sync |
| `normalizeSnapshot` | `backend/src/workers/processors/dimo-snapshot.processor.ts` | DIMO → `VehicleLatestState` Feld-Mapping |
| `interpretVehicleState` | `backend/src/modules/vehicles/vehicle-state-interpreter.ts` | Display-State (MOVING/IDLE/PARKED), 3-State `onlineStatus` |
| `classifyTelemetryFreshness` | `backend/src/modules/vehicles/vehicle-state-interpreter.ts` | 5-State Freshness (<15m / <24h / <48h) |
| `resolveCanonicalTelemetryObservedAtMs` | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` | Timestamp-Priorität für Freshness |
| `resolveTelemetryFreshness` | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` | Backend-kanonische Freshness-Auflösung |
| `deriveFleetStatusContext` | `backend/src/modules/vehicles/vehicles.service.ts` | Fleet-Status, Odometer, Fuel/SOC, Booking-Kontext |
| `resolveFuelPercent` / `resolveFuelPercentOrNull` | `backend/src/modules/vehicles/vehicles.service.ts` | Tankstand-Berechnung aus rel/abs Signalen |
| `VehicleConnectivityRuntimeStateBuilder.build` | `backend/src/modules/vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder.ts` | Connectivity Runtime (inkl. `resolveTelemetryState`) |
| `deriveTelemetryState` | `frontend/src/rental/components/dashboard/runtime/vehicleRuntimeStateBuilder.ts` | Dashboard 4-State (`live`/`standby`/`soft_offline`/`offline`/`unknown`) |
| `resolveTelemetryFreshness` | `frontend/src/rental/lib/telemetryFreshness.ts` | Frontend-kanonische 5-State Freshness |
| `normalizePlate` | `backend/src/modules/ai/chat/fleet-chat-context.util.ts` | AI-Chat Kennzeichen (kompakt, ohne Leerzeichen) |
| `normalizeVehiclePlate` | `backend/src/modules/document-extraction/vehicle-candidate-matching.util.ts` | Document Intake (strip `[\s\-._/]+`) |

---

## 8. Source-of-Truth-Matrix

Spalten: **Fachinformation** | **Primäre Quelle** | **Fallback** | **Berechnungslogik** | **Freshness-Regel** | **UI-Seiten** | **Backend-Services** | **AI verfügbar?** | **Inkonsistenzen**

### 8.1 Identität & Stammdaten

| Fachinformation | Primäre Quelle | Fallback | Berechnungslogik | Freshness | UI-Seiten | Backend-Services | AI? | Inkonsistenzen |
|-----------------|----------------|----------|------------------|-----------|-----------|------------------|-----|----------------|
| **Interne Fahrzeug-ID** | `Vehicle.id` (UUID) | — | Bei Registrierung vergeben | Statisch | Alle Vehicle-Views, Bookings, Tasks | `VehiclesService`, Prisma | Nur indirekt (nicht im Prompt) | — |
| **Kennzeichen** | `Vehicle.licensePlate` | — | Manuell / Document Intake | Statisch bis Edit | Fleet Map, Detail-Header, Bookings, Invoices | `VehiclesService`, Document Extraction | ✅ Text im Fleet-Context | **3 Normalisierungen:** `normalizePlate` (AI, kompakt), `normalizeVehiclePlate` (Docs), Voice MCP `equals insensitive` (exakt) |
| **VIN** | `Vehicle.vin` (Registrierung) | `DimoVehicle.vin` via `fetchVehicleVin` (Sync) | Operator-Eingabe gewinnt bei Register | Bei DIMO-Sync | Vehicle Detail, Settings, Document Intake | `DimoApiSyncService`, `VehiclesService` | ✅ Text im Fleet-Context | Mirror kann hinter `Vehicle.vin` liegen |
| **Make / Model / Year** | `Vehicle.make/model/year` | `DimoVehicle.*` (Sync) | Registrierung + DIMO Mirror | Statisch / Sync | Fleet, Detail, Bookings | `VehiclesService`, `DimoVehicleSyncService` | ✅ Text im Fleet-Context | — |
| **Fahrzeugname** | `Vehicle.vehicleName` | — | Manuell | Statisch | Fleet, Detail | `VehiclesService` | ✅ Text + Resolution-Hint | — |
| **Kraftstofftyp** | `Vehicle.fuelType` (Enum) | `DimoVehicle.fuelType` / `powertrainType` | Registrierung | Statisch | Fleet, Detail, Fuel/EV UI | `VehiclesService` | ✅ `fuel={fuelType}` im Prompt | EV vs. Verbrenner steuert Fuel vs. SOC Anzeige |
| **DIMO Token ID** | `DimoVehicle.tokenId` | `rawJson.syntheticDevice.tokenId` (Display) | Pairing / Identity Sync | Bei Sync | Master Fleet Connection (maskiert) | `DimoApiSyncService`, Snapshot Processor | ✅ `tokenId=N` im Fleet-Context | Ohne tokenId: System-Hint „keine Live-Telemetrie“ — aber keine echten Daten geladen |
| **Provider-Link / Pairing** | `DimoVehicle.connectionStatus` + `Vehicle.dimoVehicleId` | — | DIMO Identity + Auth | Bei Sync | Fleet Connectivity, Master | `DimoApiSyncService`, Connectivity Runtime | ❌ Nur Existenz von tokenId | `DimoVehicle.lastSignal` kann hinter VLS liegen |

### 8.2 Position & Adresse

| Fachinformation | Primäre Quelle | Fallback | Berechnungslogik | Freshness | UI-Seiten | Backend-Services | AI? | Inkonsistenzen |
|-----------------|----------------|----------|------------------|-----------|-----------|------------------|-----|----------------|
| **Koordinaten (operativ)** | `VehicleLatestState.latitude/longitude` | `getLiveGps` → DIMO `currentLocationCoordinates`; `getVehicleWithTelemetry` → `fetchLastSeenLocation` wenn fehlend oder `isLiveTracking` | `normalizeSnapshot` aus `signalsLatest.currentLocationCoordinates` | `lastSeenAt` / `sourceTimestamp`; Live-GPS = Echtzeit | Fleet Map, Overview Map, Connectivity Detail | `DimoSnapshotProcessor`, `VehiclesService.getLiveGps`, `getVehicleWithTelemetry` | ❌ | Live-GPS schreibt nicht in DB; Map kann neuer sein als Fleet-List |
| **Letzter bekannter Standort (Zeit)** | `VehicleLatestState.lastSeenAt` | `VehicleLatestState.sourceTimestamp` (Provider-observed) | DIMO `signalsLatest.lastSeen` → `normalizeSnapshot` | Siehe Freshness-Matrix | Fleet, Detail, Connectivity | Snapshot Processor, `telemetry-freshness.resolver` | ❌ | `interpretVehicleState` nutzt nur `lastSeenAt`, nicht volle Timestamp-Priorität |
| **Geschwindigkeit** | `VehicleLatestState.speedKmh` | `getLiveGps` speed; Legacy `0` in DTOs | `numVal(signals.speed)`; Display: `null` wenn stale | Fresh wenn `<15 min` für `displaySpeed` | Fleet Map, Detail Telemetry, Live Map | `normalizeSnapshot`, `interpretVehicleState` | ❌ | Legacy `speed` Feld = `0` statt `null` in `getVehicleWithTelemetry` |
| **Aufgelöste Adresse** | **Keine Backend-Quelle** | Frontend `addressService.ts` → Mapbox Reverse Geocode | Client-seitig aus Koordinaten | Mapbox-Cache; Stale-Hint 15 min | Map Popups, Overview | — (nur Client) | ❌ | Adresse existiert nirgends serverseitig; AI kann sie nicht kennen |

### 8.3 Betriebszustand

| Fachinformation | Primäre Quelle | Fallback | Berechnungslogik | Freshness | UI-Seiten | Backend-Services | AI? | Inkonsistenzen |
|-----------------|----------------|----------|------------------|-----------|-----------|------------------|-----|----------------|
| **Zündung** | `VehicleLatestState.isIgnitionOn` | — | DIMO `isIgnitionOn >= 0.5` | Nur wenn fresh (`<15 min`): sonst `UNKNOWN` | Detail Telemetry, Dashboard | `normalizeSnapshot`, `interpretVehicleState` | ❌ | EVs oft `null`; getrennt von OBD-Plug-Signal |
| **Kilometerstand (live)** | `VehicleLatestState.odometerKm` | `Vehicle.mileageKm` (manuell); `DimoVehicle.odometerKm` (Sync-Spiegel) | `powertrainTransmissionTravelledDistance`; `deriveFleetStatusContext` → `Math.floor` | Snapshot ~30 s | Fleet, Detail, Active Booking km-Delta | `normalizeSnapshot`, `deriveFleetStatusContext`, `fetchPickupOdometerMap` | ❌ | **Dual source:** manuell vs. Telemetrie; Document Extraction bevorzugt `latestState` dann `mileageKm` |
| **Tankstand (Verbrenner)** | `VehicleLatestState.fuelLevelRelative` + `fuelLevelAbsolute` | `DimoVehicle.fuelPercent` (nur Sync) | `resolveFuelPercent`: Timestamp-Vergleich rel/abs; inferierte Tankkapazität; Default 50 L | Signal-Timestamps in `rawPayloadJson` | Fleet Map Marker, Detail | `resolveFuelPercent`, `resolveFuelPercentOrNull` | ❌ | Legacy `fuel` = `0` wenn unbekannt; kanonisch nullable `fuelPercent` |
| **Ladezustand (EV SOC)** | `VehicleLatestState.evSoc` | `DimoVehicle.batteryPercent` (Sync) | `mapDimoBatterySignals` → traction battery SOC | Snapshot ~30 s | Fleet, Detail, Battery Health | `normalizeSnapshot`, Battery-Module | ❌ | Sync-Spiegel kann laggen |
| **Außentemperatur** | **Nicht in VLS** | DIMO `exteriorAirTemperature` via `buildEnvironmentTemperatureQuery` (Trip-Scoped) | 2-Min-Buckets innerhalb Segment-Fenster | Trip-/Segment-Zeit | Battery Health (trip-derived), Trip Detail | `DimoSegmentsService` | ❌ | **Kein Live-Feld** — nur historisch pro Trip |
| **Kühlmitteltemp.** | `VehicleLatestState.coolantTempC` | — | `powertrainCombustionEngineECT` | Nur wenn fresh für Display | Detail Telemetry | `normalizeSnapshot`, `interpretVehicleState` | ❌ | — |

### 8.4 Connectivity & Freshness

| Fachinformation | Primäre Quelle | Fallback | Berechnungslogik | Freshness | UI-Seiten | Backend-Services | AI? | Inkonsistenzen |
|-----------------|----------------|----------|------------------|-----------|-----------|------------------|-----|----------------|
| **Telemetrie-Freshness (5-State)** | `resolveTelemetryFreshness` / `classifyTelemetryFreshness` | — | `<15m live`, `<24h standby`, `<48h signal_delayed`, `≥48h offline`, kein TS → `no_signal` | Timestamp-Priorität: `sourceTimestamp` → `lastValidTelemetryAt` → `receivedAt`* → `DimoVehicle.lastSignal` → `lastSeenAt`/`updatedAt` (*mit Backfill-Guard 15 min) | Fleet Connectivity, Detail Badges, Dashboard | `telemetry-freshness.resolver.ts`, `vehicle-state-interpreter.ts`, FE `telemetryFreshness.ts` | ❌ | `interpretVehicleState` klassifiziert nur über `lastSeenAt`, nicht volle Evidence-Kette |
| **Legacy `onlineStatus` (3-State)** | `interpretVehicleState` | — | ONLINE `<15m`, STANDBY `<24h`, sonst OFFLINE | Nur `lastSeenAt` | Ältere API-Felder, Fleet DTOs | `vehicle-state-interpreter.ts` | ❌ | **Standby + signal_delayed** beide → OFFLINE in 3-State |
| **Dashboard `telemetryState` (4-State)** | `deriveTelemetryState` (Frontend) | `unknown` wenn kein Timestamp | `live` / `standby` / `soft_offline` / `offline`; `hasFreshLiveHint` kann live erzwingen | `max(lastSignal, lastSeen, …)` — **ohne** Backfill-Guard | Dashboard Runtime Board, Station Command | `vehicleRuntimeStateBuilder.ts` | ❌ | `soft_offline` ≠ Backend `signal_delayed` (Naming); Timestamp-Input einfacher |
| **Connectivity `overallState`** | `VehicleConnectivityRuntimeStateBuilder` | — | Komposition: Provider-Link + `telemetryState` + OBD-Episodes + Data Coverage | `resolveTelemetryState` → `classifyTelemetryFreshness` auf `lastTelemetryAt` | Fleet Connectivity Tab | `vehicle-connectivity-runtime-state.builder.ts`, `VehicleConnectivityRuntimeProjectionService` | ❌ | OBD unplug episodes können offen bleiben trotz Live-Telemetrie (P0-Audit-Risiko) |
| **OBD Plug-Status** | Webhook `DeviceConnectionEpisodes` + Runtime Builder | Snapshot `rawPayloadJson.obdIsPluggedIn` | `extractObdPlugSignalFromSnapshot`; Episode-Reconciliation | Episode-basiert + Snapshot-Recovery | Fleet Connectivity, Device Connection Card | `DeviceConnectionEpisodeResolutionService`, Connectivity Runtime | ❌ | **Drei Wahrheiten:** Snapshot raw, Webhook episodes, Runtime synthesis |
| **Letztes Signal (Mirror)** | `DimoVehicle.lastSignal` | `VehicleLatestState.lastSeenAt` | `fetchVehicleSummary` bei Identity-Sync | Nur bei Sync aktualisiert (~nicht 30s) | Master DIMO Views | `DimoApiSyncService` | ❌ | Kann **stunden** hinter VLS liegen |
| **Provider `online` Boolean** | `VehicleLatestState.online` | `interpreted.isFresh` | Processor setzt aus Freshness | `<15 min` | Fleet DTO `online` | Snapshot Processor + Interpreter | ❌ | `online:false` möglich bei `telemetryFreshness: standby` |

### 8.5 Historische & Analytische Daten

| Fachinformation | Primäre Quelle | Fallback | Berechnungslogik | Freshness | UI-Seiten | Backend-Services | AI? | Inkonsistenzen |
|-----------------|----------------|----------|------------------|-----------|-----------|------------------|-----|----------------|
| **Trip-Grenzen** | DIMO Segments → PostgreSQL `Trip` | — | `DimoSegmentsService` + Reconciliation | Segment `startedAt`/`endedAt` | Trip Detail, Fleet Trips | `DimoSegmentsService`, Trip Module | ❌ | Architektur-Regel: Segments = kanonisch |
| **Route-Geometrie** | DIMO `signals` innerhalb Trip-Fenster | ClickHouse `telemetry_waypoints` | Historische Signal-Rekonstruktion | Trip-Zeitfenster | Trip Map | `DimoSegmentsService`, CH Waypoints | ❌ | CH optional / best-effort |
| **HF-Verhalten (1s)** | DIMO HF Query | ClickHouse `telemetry_hf_*` wenn `HF_MIRROR_ENABLED` | Post-Trip Enrichment | Trip-abgeschlossen | Data Analyse, Trip Evidence | `TripBehaviorEnrichmentService`, `ClickHouseHfService` | ❌ | CH ≠ operative Wahrheit |
| **Snapshot-Historie** | ClickHouse `telemetry_snapshots` | — | Dual-Write aus Processor (fire-and-forget) | `recordedAt` | Data Analyse, Ops | `ClickHouseTelemetryService` | ❌ | Leerer CH ≠ fehlende PG-Daten |
| **Position-Updates (PG)** | `VehiclePositionUpdate` | — | Separates Modell (nicht primärer Live-Pfad) | `recordedAt` | — | Prisma | ❌ | Parallel zu VLS; nicht Haupt-UI-Pfad |

### 8.6 Caches

| Cache | Key / Ort | TTL | Inhalt | Invalidierung |
|-------|-----------|-----|--------|---------------|
| Fleet Map | Redis `fleet-map:{orgId}:v1` | ~5 s (set in `getFleetMapData`) | Serialisierte `FleetMapVehicleDto[]` | `FleetMapCacheService.invalidate` |
| DIMO Vehicle JWT | Redis via `DimoAuthService` | Token-Lifetime | Vehicle-scoped JWT | Auth refresh |
| Rental Health Summary | Redis `rental-health:summary:{orgId}:{vehicleId}` | Config-driven | Health summary per vehicle | Cache service |
| Reverse Geocode | Client `Map` in `addressService.ts` | Pro Koordinaten-Key | Mapbox-Adresse | Client-only |
| Fleet Map (kein Redis) | — | — | `/telemetry`, `/live-gps` uncached | — |

---

## 9. API-Live-Abfrage vs. gespeicherte Daten

| Aspekt | Gespeichert (`VehicleLatestState`) | Live-API (`getLiveGps` / `fetchLastSeenLocation`) |
|--------|-----------------------------------|--------------------------------------------------|
| **Schreibpfad** | `DimoSnapshotProcessor` alle ~30 s | Kein Write |
| **Latenz** | Bis ~30 s + Queue | Echtzeit DIMO Round-Trip |
| **Auth** | Worker (intern) | `DataAuthorization` GPS_LOCATION für Org |
| **Felder** | Vollständiger Snapshot (Speed, Fuel, Ignition, …) | Primär GPS + Speed |
| **Verwendung** | Fleet Map Bulk, Connectivity, Fleet List | Overview Live Map Animation |
| **`getVehicleWithTelemetry`** | Liest VLS primär | Ruft `fetchLastSeenLocation` wenn coords fehlen **oder** `isLiveTracking` |

**Regel für künftige AI-Tools:** Operative Antworten sollten **`VehicleLatestState` + `resolveTelemetryFreshness`** als Default nutzen; Live-GPS nur wenn Freshness `live` und Sub-30s-Genauigkeit nötig — mit explizitem `source: 'live'` vs. `'snapshot'` in der Tool-Antwort.

---

## 10. Duplizierte Berechnungen & Inkonsistenzen (Querschnitt)

| # | Thema | Stellen | Auswirkung |
|---|-------|---------|------------|
| I1 | **Drei Freshness-Vokabulare** | BE 5-State (`signal_delayed`), FE Dashboard 4-State (`soft_offline`), Legacy 3-State (`onlineStatus`) | Gleiche Schwellen (15m/24h/48h), unterschiedliche Namen und Timestamp-Inputs |
| I2 | **Timestamp-Priorität** | `telemetry-freshness.resolver` (voll) vs. `interpretVehicleState` (nur `lastSeenAt`) vs. `deriveTelemetryState` (max mehrerer Felder) | Dashboard/Fleet können bei Backfill-Ingest divergieren |
| I3 | **Kennzeichen-Normalisierung** | AI `normalizePlate`, Docs `normalizeVehiclePlate`, Voice Prisma `insensitive` | Cross-Module Matching kann scheitern (`M-AB 123` vs. `MAB123`) |
| I4 | **Dual Odometer** | `Vehicle.mileageKm` vs. `VehicleLatestState.odometerKm` vs. `DimoVehicle.odometerKm` | UI: Telemetrie first; Docs: latestState then mileageKm |
| I5 | **Dual Fuel/SOC Mirror** | VLS (30 s) vs. `DimoVehicle` (Sync) | Master-Views können veraltete Werte zeigen |
| I6 | **Legacy `0` vs. `null`** | `mapToVehicleData.fuel/speed` vs. `fuelPercent`/`displaySpeed` | „0%“ statt „—“ in älteren Consumern |
| I7 | **OBD Plug drei Wahrheiten** | Snapshot raw, Webhook episodes, Runtime builder | Bekanntes P0 in Fleet-Connectivity-Audits |
| I8 | **Adresse nur Client** | `addressService.ts` | Backend/AI haben keine strukturierte Adresse |
| I9 | **Außentemp. nur Trip-Scoped** | Kein VLS-Feld | Live-Fragen zu Außentemp. nicht beantwortbar |
| I10 | **AI Chat vs. Rest** | Nur `Vehicle` Stammdaten, kein VLS | Größte Domain-Grounding-Lücke für Prompt-Reihe |

---

## 11. AI-Verfügbarkeit — Zusammenfassung (Prompt 2)

| Datenklasse | Fleet AI Chat (`ChatService`) | Voice MCP (`get_vehicle_status`) | WhatsApp AI (`WhatsAppAiToolsService`) |
|-------------|------------------------------|----------------------------------|----------------------------------------|
| Stammdaten (Plate, VIN, Make, tokenId) | ✅ Im Prompt-Text | ✅ Via `findOne` | ✅ Kontextabhängig |
| Live Telemetrie (GPS, Speed, Odo, Fuel) | ❌ | ❌ (nur Status-Labels) | ✅ GPS/DTC via `VehiclesService` (limitiert) |
| Connectivity / Freshness | ❌ | Teilweise (operational labels) | ✅ GPS stale check (`STALE_GPS_MS` 2h) |
| Historische Trips / Segments | ❌ | ❌ | ❌ |
| Adresse | ❌ | ❌ | ❌ |

`ChatService.buildContext` berechnet `tokenIds` via `resolveChatVehicleTokenIds`, nutzt sie aber **nur für Logging** — kein nachgelagerter DIMO- oder VLS-Lookup.

---

## 12. Offene Fragen (Prompt 3+)

1. Welche Felder aus der Matrix sollen als **erste AI-Tools** priorisiert werden (VLS-Snapshot vs. Live-GPS)?
2. Soll AI die **kanonische Freshness** (`resolveTelemetryFreshness`) pro Antwort mitliefern?
3. Einheitliche **Kennzeichen-Normalisierung** über AI, Voice, Docs — welche Funktion wird Standard?
4. Soll **Adresse** serverseitig persistiert/gecached werden für AI und Ops?
5. Wie mit **OBD-Episode vs. Live-Telemetrie-Konflikt** in AI-Antworten umgehen?
6. Dürfen **VIN/Kennzeichen/Koordinaten** an Mistral — Tenant-DPA-Klärung?
7. Soll AI **Trip/Segment-Daten** lesen dürfen (DIMO Segments als kanonische Grenze)?

---

## Anhang D — Statische Prüfungen Prompt 2

| Prüfung | Ergebnis |
|---------|----------|
| `telemetry-freshness.resolver.spec.ts` | PASS |
| `vehicle-state-interpreter.spec.ts` | PASS |
| `vehicle-connectivity-runtime-state.builder.spec.ts` | PASS |
| `connectivity-cross-surface-regression.test.ts` (Frontend) | 19/19 PASS |
| Grep `fetchLatestVehicleSnapshot` in `backend/src` | 2 Produktions-Call-Sites (Processor + Tests) |
| Grep `VehicleLatestState` upsert | `DimoSnapshotProcessor` (sole writer) |

---

**Changes / Architektur aktualisiert:** Nein — reiner Ist-Audit (Dokumentation in `docs/audits/` only).
