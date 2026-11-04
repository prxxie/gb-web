# Module — web-app

Answers go to brief § 14 "Type-specific" under a `### web-app` heading, unless another section is named.

## UI

| # | Question | Notes / default |
|---|----------|-----------------|
| W1 | **[lite]** List the main screens or pages and what the user does on each. | Becomes `02-reference/screens/`; one line each is enough |
| W2 | Are there designs (Figma, mockups, HTML prototypes)? Put them in `docs/00-source/`. | Missing designs → propose a component library |
| W3 | Which devices and browsers must be supported? Mobile-responsive? | Default: last 2 versions of evergreen browsers, responsive |
| W4 | Design system or component library preference? Brand guidelines? | Default: one well-known library for the chosen framework |
| W5 | Accessibility target? | Default: WCAG 2.2 AA |
| W6 | Languages / localization in the UI? | Default: English only |

## Architecture

| # | Question | Notes / default |
|---|----------|-----------------|
| W7 | **[lite]** Does it need its own backend, or is it front-end only over existing APIs / a BaaS? | Backend → also load `api-service.md` |
| W8 | Rendering: single-page app, server-rendered, static site, or mixed? SEO needs? | Public + SEO → SSR/SSG; internal tool → SPA |
| W9 | Real-time needs (live updates, notifications, collaboration)? | |
| W10 | File uploads or downloads (types, size limits)? Exports (CSV, PDF, Excel)? | Security flag for uploads |
| W11 | Email or in-app notifications? | Email → integration question X5 |
