# P5B3 — Voice MCP live organization lifecycle

`VoiceMcpGatewayMiddlewareService.assertTenantBindings` enforces P3 `TENANT_OPERATIONAL` via live `organization.status` on every MCP request (before assistant/deployment/subscription checks). Tokens issued while ACTIVE are denied after suspend/archive without relying on JWT issuance-time state alone.