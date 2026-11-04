---
id: EPIC-07-pwa-i18n
code: PWA
title: Installable PWA, offline play, bilingual UI and accessibility
---

# EPIC-07 — Installable PWA, offline play, bilingual UI and accessibility

The mobile delivery surface: a service worker that makes the app open without a network, the offline bot match, the
Vietnamese/English switch with no untranslated string left, the landscape-only layout with a rotate notice, and the
accessibility bar (WCAG 2.2 AA, touch targets, live regions).

## Goal

A player adds the game to their home screen, opens it in a tunnel and plays a bot match; a Vietnamese player and an
English player see the same screens in their own language; nobody is blocked by a portrait orientation or a screen
reader.

## Stories

Generated from story frontmatter — run `node .agents/scripts/verify-docs.mjs --fix`; do not edit by hand.

<!-- cpt:epic-stories -->
| Id | Title | Priority | Size | Status | Depends on |
|---|---|---|---|---|---|
| [US-PWA-001](US-PWA-001-install-and-play-offline.md) | Install the app and open it without a network | P1 | M | ready | US-FND-003, US-CORE-005 |
| [US-PWA-002](US-PWA-002-switch-between-vietnamese-and-english.md) | Switch between Vietnamese and English with no missing string | P2 | M | ready | US-FND-003 |
| [US-PWA-003](US-PWA-003-landscape-only-layout.md) | Enforce the landscape layout with a rotate notice | P1 | S | ready | US-FND-003 |
| [US-PWA-004](US-PWA-004-meet-the-accessibility-bar.md) | Meet the accessibility bar on every screen | P2 | M | ready | US-FND-003, US-MATCH-003 |
<!-- /cpt:epic-stories -->

## Out of scope

- Store listing, native wrappers (Capacitor), push notifications.
- A third language; RTL layouts.
