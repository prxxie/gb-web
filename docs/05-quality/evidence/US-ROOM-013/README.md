# US-ROOM-013 — browser evidence

- Route: `/` (`http://localhost:5175/`), with a locally created public room in the local D1 database
- Ran: 2026-11-14, Chromium 156.0.8078.4 via headless Playwright, Vite on `:5175`, `wrangler dev` on `:8787`
- Changed surface: the `Phòng công khai` dialog at 844 x 390, including the public/private create control
- Console: no warnings or errors after load, opening the dialog, changing to `Đang chờ`, or closing it
- Network: no HTTP responses at or above 400; opening the dialog and selecting the filter each made one `GET /api/v1/rooms`
- Accessibility: the dialog has the name `Phòng công khai`; filters expose `aria-pressed`; waiting rows have a
  `Vào phòng <code>` button; a full waiting row has no join action
- Keyboard: the close control receives focus on open; `Shift+Tab` and `Tab` wrap inside the dialog, and closing returns
  focus to `public-rooms` ([focus.txt](focus.txt))
- Layout: the three primary menu actions stay inside the 844 x 390 viewport with no vertical page overflow
- Not checked: Lighthouse or performance trace; this change adds no large asset or first-paint dependency

Files: [screen.png](screen.png), [a11y.txt](a11y.txt), [console.txt](console.txt), [network.txt](network.txt).
