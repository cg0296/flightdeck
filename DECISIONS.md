# Flightdeck Decisions Log

## 2026-03-19: Initial Setup

### Decision: Local-only mode without OpenClaw Gateway
- Set `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` in .env
- All gateway-dependent features show "Local Mode" indicators
- Local agent spawning uses direct Claude CLI invocation via child_process

### Decision: Claude CLI Path
- Using VS Code extension path: `C:\Users\Curt\.vscode\extensions\anthropic.claude-code-2.1.78-win32-x64\resources\native-binary\claude.exe`
- Hardcoded as default, configurable via env var `CLAUDE_CLI_PATH`

### Decision: Node.js Version
- Lowered min version check from 22 to 20 in `scripts/check-node-version.mjs`
- Reason: Machine has Node 20.12.2, which works fine for all features
- The `${PORT:-3000}` bash syntax in package.json scripts didn't work on Windows, so hardcoded port 3000

### Decision: Spawn Architecture
- Local spawn endpoint at `/api/spawn/local` (separate from gateway spawn at `/api/spawn`)
- Active processes tracked in-memory via a Map (lost on server restart — acceptable for local use)
- Process output buffered in-memory (capped at 50KB) and written to `flight_history` table on exit
- Last 2000 chars stored as `output_summary`

### Decision: Flight History
- New `flight_history` SQLite table (migration 043) stores all agent run metadata
- Queried via `/api/flights` endpoint with search/filter/pagination
- Displayed in "Flight Log" panel added to the OBSERVE nav group

### Decision: Stats Bar
- Added to the main layout between header and content area
- Polls `/api/spawn/local` and `/api/flights` for live stats
- Configurable refresh interval (2s–60s) with auto-refresh toggle

### Decision: Rebrand
- "Mission Control" → "Flightdeck" in all user-visible text
- Primary color changed to Golteris Green (#6B9B37)
- "by Golteris" tagline added under nav rail logo
- All 10 i18n locale files updated
- Internal variable/store names left unchanged to avoid breakage

### Decision: Floating Launch Button
- Used a fixed-position FAB (floating action button) at bottom-right
- Opens the Launch Agent modal with repo picker, task prompt, model selector
- This avoids modifying the header bar component which is complex
