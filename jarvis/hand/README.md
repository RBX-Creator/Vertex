# Hand – Computer- und Browser-Steuerung

Phase 4. Siehe [`../docs/architektur.md`](../docs/architektur.md#schicht-3--hand).

Geplant:
- `hand-agent`: läuft auf dem PC, verbindet sich ausgehend mit dem Server.
- Werkzeuge als MCP-Server: `browser` (Playwright), `computer` (Claude Computer Use), `system` (Allowlist).
- Sicherheitsstufen 🟢/🟡/🔴 aus `core/rules.md` werden im Agent erzwungen.

Schon heute nutzbar: In Claude Code kann man einen Browser-MCP-Server (z. B. Playwright MCP)
in `.mcp.json` eintragen – dann kann Jarvis lokal bereits Webseiten öffnen und bedienen.
