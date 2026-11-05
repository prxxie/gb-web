# US-FND-002 — worker skeleton and health, local run

- Ran: 2026-11-05, `npx wrangler dev --port 8787 --ip 127.0.0.1` in `apps/worker`, `.dev.vars` present, local D1 + DO
- Surface: `/api/v1/health`, `/api/v1/sessions`, `/api/v1/rooms`, `/api/v1/rooms/{code}`, `.../join`, `.../ws`,
  `/api/v1/turn-credentials`, `/api/v1/leaderboard`, `/api/v1/me`, and one unknown route
- `api-smoke.txt` holds the transcript (session tokens redacted). Every status is the documented one: health `200`,
  session `201`, room `201`, preview `200 host:true joinable:true`, join `200`, turn credentials `200`,
  leaderboard `200`, WebSocket upgrade `101`, unknown route `400` with an RFC 9457 body carrying `request_id`
- Proves TC-FND-001 and the error shape of TC-FND-070 for the routes exercised
- Not proven: TC-FND-070 (no `openapi.yaml` parity run), TC-FND-100 (migrations were not applied to a fresh D1 in this
  pass), and the `turn:false` branch means no TURN credential was ever issued — the values in `.dev.vars` are placeholders
