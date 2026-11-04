---
id: ADR-0003
title: D1 owns every relational record; the room Durable Object owns only ephemeral room state
status: accepted
date: 2026-11-04
supersedes: []
---

# ADR-0003 — D1 owns every relational record; the room Durable Object owns only ephemeral room state

## Context

v1 needs accounts, profiles, Elo ratings, match records and a leaderboard (`docs/00-source/brief.md` §7, §8), plus the
existing ephemeral room state (`RoomState`: code, host, players, status) that the signaling Durable Object already
holds. Cloudflare offers three stores on the Free plan: D1 (SQL, 5 GB total / 500 MB per database, 5M rows read and
100k written per day), KV (eventually consistent key-value), and per-object SQLite storage inside Durable Objects.

Free-tier cost is a hard constraint (`NFR-02`), and the leaderboard is the only read pattern that can grow.

## Decision

Put all relational data in **D1**: `Account`, `Profile`, `MatchRecord`, `MatchPlayer`, `RatingHistory`. The `Room`
Durable Object keeps **only** in-flight room state (membership, host, migration counter) and deletes it when the room
closes. No KV store for v1. Every schema change ships as a numbered migration under `apps/worker/migrations/`, applied
with `wrangler d1 migrations apply`.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| **D1 for all relational data** | One SQL source of truth; `ORDER BY rating LIMIT 100` is a one-line leaderboard; joins for match history; migrations and point-in-time recovery (7 days, Free) | 500 MB per database and daily row limits; SQLite dialect (no `SKIP LOCKED`, limited JSON functions); single-region primary |
| D1 + KV leaderboard cache | Fewer D1 reads | Second store, staleness window, cache invalidation code nobody asked for; reads are not the bottleneck (5M/day vs. an expected < 100k) |
| Per-player Durable Object with SQLite | Strong per-player consistency | Leaderboard becomes an N-object fan-out; no ad-hoc SQL; DO storage is billed by rows read/written as well |
| External Postgres (Neon/Supabase free) | Familiar, richer SQL | Adds a vendor, a connection path and latency to the one layer that must stay free tier; contradicts the Cloudflare-only deployment in `deployment.md` |

## Consequences

- **Easier:** one place to inspect data (`wrangler d1 execute --local/--remote`); match + rating writes in one batch
  transaction; rating recomputation is a query, not a job.
- **Harder:** SQLite semantics must be respected (no `RETURNING`-heavy patterns across old versions, `CHECK` instead of
  enums); the D1 primary region is fixed at creation and cannot move.
- **Limits to watch:** 100k row writes/day — a rated match writes 1 `MatchRecord` + up to 8 `MatchPlayer` + up to 8
  `Account.rating` updates + up to 8 `RatingHistory` rows ≈ 25 writes, so the ceiling is ~4,000 rated matches/day; the
  runbook names the alert (`08-ops/runbook.md`).
- **Follow-ups:** `OQ-28` fixes the Elo constants; migration and backup steps are in `01-overview/deployment.md`.
- **Revisit when:** the leaderboard needs read caching (add KV as a cache only), or writes approach the daily limit
  (then rate-limit or move history to R2/KV cold storage).
