# SynqDrive AI-Agent — Ist-Audit der Chat-Runtime (Domain Grounding)

| Feld | Wert |
|------|------|
| **Phase** | Prompt 1 von 32 — Vollständiger Ist-Audit (read-only) |
| **Datum** | 2026-07-24 (UTC) |
| **Repository** | `https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **HEAD (Audit)** | `f5a5b4e3` — `fix(infra): Nginx HSTS/metrics hardening + CI typecheck drift (V4.9.809)` |
| **Methode** | Statische Code-Analyse, Architektur-/Changelog-Querprüfung, gezielte Unit-Tests (`chat.service.spec.ts`, `iam-endpoint-enforcement-triage.security.spec.ts` — 14/14 PASS). **Keine produktiven Code-Änderungen.** |

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

**Changes / Architektur aktualisiert:** Nein — reiner Ist-Audit (Dokumentation in `docs/audits/` only).
