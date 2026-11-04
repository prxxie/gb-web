# Attribution

`packs/react-vite` was distilled from four MIT-licensed skills in [affaan-m/ECC](https://github.com/affaan-m/ECC)
v2.2.3, © 2026 Affaan Mustafa:

- `skills/react-patterns` — derived state, hooks discipline, state-placement decision tree, form and data-fetching
  decisions
- `skills/react-testing` — query priority, `userEvent`, MSW setup, hook tests, `axe` assertions, coverage shape
- `skills/vite-patterns` — config, `VITE_` env exposure rules, proxy, build pitfalls, barrel-file and pre-bundle issues
- `skills/e2e-testing` — page object structure, Playwright config, flake causes

Changes made to fit the CPT pack contract: split into three reference files with one owning concern each, tool commands
moved into the PROJECT values table, a project-specific review checklist added, and the following upstream defects
corrected:

- `react-patterns` and `react-testing` mix Next.js Server Components into React guidance — dropped: a Vite app has no
  RSC, and shipping both in one file made the agent apply `"use server"` in a client-only app.
- `e2e-testing` waits on `waitForLoadState('networkidle')` and locates by `data-testid` first — replaced with web-first
  assertions and role/label locators, since `networkidle` is unreliable on any app that polls or streams.
- Both React skills link to `../../rules/react/*.md`, which does not exist in the upstream tree; the rules are inlined
  here instead.

## Upstream license (MIT)

The upstream MIT license text and copyright notice travel with these portions:

MIT License — Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
