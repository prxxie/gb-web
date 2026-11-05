// @vitest-environment jsdom
/**
 * Problem-document errors (`US-PWA-002` AC6).
 *
 * A `problem+json` body carries a `type`; the screen shows the dictionary line for that type. When the
 * client has no line for the type it shows `errors.generic` and the server's own `title` underneath,
 * instead of a generic "something went wrong" that throws the server's wording away.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, errorMessage, request } from "../src/lib/api";
import { translator } from "../src/i18n";

function problemBody(type: string, title: string): Record<string, unknown> {
  return { type, title, status: 418 };
}

function respond(status: number, body: unknown): Response {
  return {
    status,
    ok: false,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiError", () => {
  it("names the dictionary entry for a known type", () => {
    const error = new ApiError("room-full", 409, "full");
    expect(error.messageKey).toBe("errors.room-full");
    expect(error.subtitle).toBeNull();
  });

  it("falls back to errors.generic and keeps the server title for an unknown type", () => {
    const error = new ApiError("unknown", 418, "teapot", "req-1", [], "Teapot is on strike");
    expect(error.messageKey).toBe("errors.generic");
    expect(error.subtitle).toBe("Teapot is on strike");
  });
});

describe("request", () => {
  it("parses the type suffix out of the problem type IRI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(409, problemBody("https://gbw/errors/room-closed", "Closed"))));
    await expect(request("/rooms/ABC")).rejects.toMatchObject({ type: "room-closed", status: 409 });
  });

  it("maps a type the client does not know to `unknown`", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(418, problemBody("https://gbw/errors/teapot", "Teapot is on strike"))));
    const caught = await request("/rooms/ABC").catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.type).toBe("unknown");
    expect(error.messageKey).toBe("errors.generic");
    expect(error.subtitle).toBe("Teapot is on strike");
  });

  it("uses the status when the body carries no type at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(404, { title: "Not Found" })));
    await expect(request("/rooms/ABC")).rejects.toMatchObject({ type: "room-not-found" });
  });
});

describe("errorMessage", () => {
  const vi = translator("vi");
  const en = translator("en");

  it("renders the dictionary line of a known type", () => {
    expect(errorMessage(new ApiError("room-full", 409, "full"), vi)).toBe(vi("errors.room-full"));
    expect(errorMessage(new ApiError("room-full", 409, "full"), en)).toBe(en("errors.room-full"));
  });

  it("renders errors.generic followed by the server title for an unknown type", () => {
    const message = errorMessage(new ApiError("unknown", 418, "teapot", undefined, [], "Teapot is on strike"), vi);
    expect(message).toBe(`${vi("errors.generic")} Teapot is on strike`);
  });

  it("never returns a raw key", () => {
    for (const locale of [vi, en]) {
      expect(locale("errors.generic")).not.toBe("errors.generic");
    }
  });

  it("keeps a plain failure as a retry line", () => {
    expect(errorMessage(new Error("boom"), vi)).toBe(vi("common.retry"));
  });
});
