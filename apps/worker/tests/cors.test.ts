/**
 * `TC-ROOM-715`: the origin allow-list can name a Pages preview without becoming a wildcard (`US-FND-004` AC1, `NFR-11`).
 *
 * Every preview deployment lives on its own host (`https://<hash>.gbw-pages.pages.dev`), so an exact list can never name one
 * — and the alternative, `*`, would let any site drive a signed-in user's session. A `*` inside the pattern is the middle
 * ground: it stands in for one run of characters in the host and nothing else.
 */
import { describe, expect, it } from "vitest";
import { decideCors } from "../src/lib/cors";

function origin(value: string): Request {
  return new Request("https://gbw-api.example/api/v1/health", { headers: { origin: value } });
}

describe("TC-ROOM-715: preview hosts and the allow-list", () => {
  const allowed = ["https://gbw-pages.pages.dev", "https://*.gbw-pages.pages.dev", "http://localhost:*"];

  it("lets any preview host through", () => {
    expect(decideCors(origin("https://a1b2c3.gbw-pages.pages.dev"), allowed).allowed).toBe(true);
    expect(decideCors(origin("https://pr-12.gbw-pages.pages.dev"), allowed).allowed).toBe(true);
    // The bare production host is matched by its own exact entry, not by the wildcard.
    expect(decideCors(origin("https://gbw-pages.pages.dev"), allowed).allowed).toBe(true);
  });

  it("does not let a lookalike or another site through", () => {
    expect(decideCors(origin("https://evil.example"), allowed).allowed).toBe(false);
    // A suffix match would accept this; the pattern is anchored, so it does not.
    expect(decideCors(origin("https://gbw-pages.pages.dev.evil.example"), allowed).allowed).toBe(false);
    // And the wildcard cannot reach across a path or a second label boundary.
    expect(decideCors(origin("https://a.b.gbw-pages.pages.dev.evil.example"), allowed).allowed).toBe(false);
  });

  it("keeps the localhost port wildcard working", () => {
    expect(decideCors(origin("http://localhost:5199"), allowed).allowed).toBe(true);
    expect(decideCors(origin("https://localhost:5199"), allowed).allowed).toBe(false);
  });

  it("answers a request with no origin as same-origin, unchanged", () => {
    const request = new Request("https://gbw-api.example/api/v1/health");
    expect(decideCors(request, allowed)).toEqual({ allowed: true, origin: null });
  });
});
