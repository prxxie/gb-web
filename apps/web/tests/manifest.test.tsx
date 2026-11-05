// @vitest-environment node
/**
 * The installed-app surface (`US-PWA-001` AC7, AC6).
 *
 * The manifest is what the browser reads to install the app: its name, display mode, landscape lock and
 * 192/512 icons are the install contract, and the icons must really be those sizes. This is a file check,
 * so it runs in the node environment where `fs` and `import.meta.url` agree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// jsdom's `URL` is not the one `fs` accepts, so this file runs in the node environment.
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("public/manifest.webmanifest", root), "utf8")) as {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(new URL(`public${path}`, root));
  // PNG: 8-byte signature, then the IHDR chunk whose payload starts at byte 16.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("manifest", () => {
  it("uses the product name and the short name the contract fixes", () => {
    expect(manifest.name).toBe("Game Bắn Súng Đạn Theo Lượt");
    expect(manifest.short_name).toBe("GBW");
    expect(manifest.lang).toBe("vi");
    expect(manifest.start_url).toBe("/");
  });

  it("installs full screen, locked to landscape", () => {
    expect(manifest.display).toBe("fullscreen");
    expect(manifest.orientation).toBe("landscape");
  });

  it("paints the app and the splash screen in the game background colour", () => {
    expect(manifest.background_color).toBe("#0b1020");
    expect(manifest.theme_color).toBe("#0b1020");
  });

  it("ships 192 and 512 icons that really are those sizes", () => {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
      expect(icon, `a ${size}x${size} icon`).toBeDefined();
      expect(icon?.type).toBe("image/png");
      expect(pngSize(icon?.src ?? "")).toEqual({ width: size, height: size });
    }
  });

  it("ships a maskable icon for Android's adaptive launcher", () => {
    expect(manifest.icons.some((entry) => entry.purpose.includes("maskable") && entry.sizes === "512x512")).toBe(true);
  });
});

describe("the document shell", () => {
  const html = readFileSync(new URL("index.html", root), "utf8");

  it("links the manifest exactly once", () => {
    expect(html.match(/rel="manifest"/g)).toHaveLength(1);
    expect(html).toContain('href="/manifest.webmanifest"');
  });

  it("colours the browser chrome the same as the app", () => {
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
  });

  it("lets the app reach under the notch and the home indicator", () => {
    expect(html).toContain("viewport-fit=cover");
  });

  it("does not ask iOS to launch standalone, so Safari keeps its own tab UI (AC6)", () => {
    expect(html).not.toContain("apple-mobile-web-app-capable");
  });
});
