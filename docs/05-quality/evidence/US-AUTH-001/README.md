# US-AUTH-001 — guest session, local run

- Ran: 2026-11-05 against `wrangler dev` on `127.0.0.1:8787`
- `POST /api/v1/sessions` with `{"displayName":"Host"}` → `201`, body carries `sessionToken`, `expiresAt` (60 min later),
  `subject.kind: "guest"`, `subject.guestId` set, `accountId: null`
- The same token then authenticated a room socket via the `auth` frame, so the guest path is real end to end
- Evidence: `../US-FND-002/api-smoke.txt`
- Not proven: TC-AUTH-057 (expiry), TC-AUTH-065 (`/me` refused — the smoke shows `401` for a guest, which matches),
  TC-AUTH-074 (`wsUrl` on the session response), TC-AUTH-135 (guest path from the menu, e2e)
- Wire note: the field is `sessionToken`, not `token`
