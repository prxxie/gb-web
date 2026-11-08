import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const OUT = "/home/cpt0912/.hermes/cache/scratch/shotsC";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true,
  locale: "vi-VN", extraHTTPHeaders: { "cf-connecting-ip": "198.51.100.102" } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 100)); });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByTestId("play-bot").click();
await page.waitForSelector("canvas");
await page.waitForTimeout(1700);
await page.screenshot({ path: `${OUT}/C0-idle.png` });
// hold, drag out (power) and up (angle) — both numbers must move
const read = async () => ({
  angle: (await page.getByTestId("ring-angle").innerText()).trim(),
  power: (await page.getByTestId("power-value").innerText()).replace(/\s+/g, " ").trim(),
});
await page.mouse.move(430, 250);
await page.mouse.down();
await page.waitForTimeout(420);
const atArm = await read();
await page.mouse.move(560, 250, { steps: 8 });   // straight out: power up, angle unchanged
await page.waitForTimeout(120);
const outOnly = await read();
await page.mouse.move(560, 120, { steps: 8 });   // then up: angle up, power grows a little
await page.waitForTimeout(120);
const outAndUp = await read();
await page.screenshot({ path: `${OUT}/C1-pull.png` });
await page.mouse.up();
const layout = await page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return { pad: r(".match__pad"), goldRight: Math.round(document.querySelector(".match__gold").getBoundingClientRect().right),
    padButtons: document.querySelectorAll(".match__pad button").length,
    slots: [...document.querySelectorAll(".match__pad button")].map((b) => b.getAttribute("data-slot")) };
});
console.log(JSON.stringify({ atArm, outOnly, outAndUp, layout, errors }, null, 1));
await browser.close();
