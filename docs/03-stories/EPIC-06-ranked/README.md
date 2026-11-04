---
id: EPIC-06-ranked
code: RANK
title: Results, match records, Elo and leaderboard
---

# EPIC-06 — Results, match records, Elo and leaderboard

What happens after the last shot: the host submits one result, the worker records the match transactionally, computes
Elo server-side, and the players see the result screen, their history and the leaderboard.

## Goal

A finished match is recorded exactly once, every registered participant's rating moves by a rule the client can see,
nothing is recorded for a guest, a bot match or an abandoned game, and the leaderboard ranks players by rating with a
stable tie-break.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-RANK-001](US-RANK-001-record-a-finished-match.md) | Record a finished match exactly once and rank it | P1 | M | ready | US-CORE-003, US-ROOM-005, US-AUTH-002 |
| [US-RANK-002](US-RANK-002-rate-players-with-elo.md) | Rate players with Elo after every ranked match | P1 | S | ready | US-RANK-001 |
| [US-RANK-003](US-RANK-003-show-my-match-history.md) | Show my match history | P2 | S | ready | US-RANK-001, US-AUTH-002 |
| [US-RANK-004](US-RANK-004-climb-the-leaderboard.md) | Show the leaderboard with the caller's own row | P2 | M | ready | US-RANK-002 |
| [US-RANK-005](US-RANK-005-see-the-result-screen.md) | See the result screen with the rating change | P1 | M | ready | US-RANK-001, US-CORE-003 |
<!-- /cpt:epic-stories -->

## Out of scope

- Tournaments, seasons, rating decay, placement matches.
- Anti-cheat beyond plausibility checks (`OQ-30`).
