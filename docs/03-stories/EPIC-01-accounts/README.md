---
id: EPIC-01-accounts
code: AUTH
title: Identity, guest sessions and profiles
---

# EPIC-01 — Identity, guest sessions and profiles

A player can start a match without an account, or sign in with Google or an email link and keep a profile, a rating
and a history. Clerk owns the credentials and the email; the worker mints the 60-minute session token that rooms,
signaling and TURN use ([ADR-0002](../../04-decisions/adr/ADR-0002-auth-clerk-jwt.md)).

## Goal

An anonymous visitor creates a room in one tap, and a signed-in player edits a unique display name, picks an avatar,
returns tomorrow with the same rating, and can delete the account and have their personal data purged within 30 days.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-AUTH-001](US-AUTH-001-continue-as-a-guest.md) | Continue as a guest without creating an account | P0 | S | done | US-FND-002 |
| [US-AUTH-002](US-AUTH-002-sign-in-with-clerk.md) | Sign in with Google or an email link and get a profile | P1 | M | done | US-FND-002, US-FND-003 |
| [US-AUTH-003](US-AUTH-003-edit-display-name-and-avatar.md) | Edit the display name and pick an avatar | P2 | S | done | US-AUTH-002 |
| [US-AUTH-004](US-AUTH-004-delete-the-account.md) | Delete the account and purge personal data within 30 days | P2 | S | done | US-AUTH-002 |
<!-- /cpt:epic-stories -->

## Out of scope

- Rating and leaderboards — EPIC-06 (this epic only stores the rating a player already has).
- Social sign-in providers beyond Google and email magic link.
- Admin tooling for accounts; support acts through the provider dashboard.
