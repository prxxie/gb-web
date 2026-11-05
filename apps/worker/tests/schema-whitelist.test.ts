/**
 * Schema whitelist — TC-AUTH-075, `docs/02-reference/api/accounts.md`.
 *
 * The doc owns the request and response field lists; this file reads them out of the markdown and holds the
 * Worker to exactly that set. A field the doc does not list must be refused, not silently swallowed, and a
 * response may not invent a field the client was not told about.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { mintSession } from "../src/lib/session";
import { TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

const DOC = readFileSync(new URL("../../../docs/02-reference/api/accounts.md", import.meta.url), "utf8");

/** The text of one `## <title>` section. */
function section(title: string): string {
  const start = DOC.indexOf(`\n## ${title}\n`);
  if (start < 0) throw new Error(`docs/02-reference/api/accounts.md has no section "${title}"`);
  const rest = DOC.slice(start + 4 + title.length);
  const end = rest.indexOf("\n## ");
  return end < 0 ? rest : rest.slice(0, end);
}

/** First-column names of the first markdown table after `marker`, verbatim (`subject.kind`, `stats.wins`). */
function fieldsAfter(marker: string, text: string): string[] {
  const lines = text.split("\n");
  const from = lines.findIndex((line) => line.trim() === marker);
  if (from < 0) throw new Error(`no "${marker}" in section`);
  const names: string[] = [];
  for (const line of lines.slice(from + 1)) {
    if (line.startsWith("|")) {
      const name = /^\|\s*`([^`]+)`/.exec(line)?.[1];
      if (name) names.push(name);
    } else if (names.length > 0) {
      break;
    }
  }
  return names;
}

const SESSION_REQUEST = fieldsAfter("Request body:", section("POST /sessions"));
const SESSION_RESPONSE = fieldsAfter("Response `201` in both modes:", section("POST /sessions"));
const ME_RESPONSE = fieldsAfter("Auth: Clerk JWT. Response `200`:", section("GET /me"));
const PATCH_REQUEST = fieldsAfter("Auth: Clerk JWT. Request body (at least one field):", section("PATCH /me"));

async function signedIn(): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv();
  harness.db.seedPlayer({ accountId: "acc_1", clerkUserId: "user_1", displayName: "Bao Tran" });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

const post = (harness: TestEnv, path: string, body: unknown, authorization?: string): Promise<Response> =>
  handleFetch(
    new Request(`https://api.test/api/v1${path}`, {
      method: path === "/me" ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
        "cf-connecting-ip": "203.0.113.10",
      },
      body: JSON.stringify(body),
    }),
    harness.env,
  );

describe("the doc's field lists are the ones enforced here", () => {
  it("reads the request fields out of accounts.md", () => {
    expect(SESSION_REQUEST).toEqual(["kind", "displayName", "clerkToken"]);
    expect(PATCH_REQUEST).toEqual(["displayName", "avatarId"]);
    expect(SESSION_RESPONSE).toContain("sessionToken");
    expect(SESSION_RESPONSE).toContain("subject.rating");
    expect(ME_RESPONSE.map((name) => name.split(".")[0])).toEqual([
      "accountId",
      "displayName",
      "avatarId",
      "rating",
      "ratedMatches",
      "stats",
      "createdAt",
      "deletionScheduledFor",
    ]);
  });
});

describe("requests accept only documented fields", () => {
  it("rejects an undocumented field on POST /sessions", async () => {
    const harness = testEnv();

    const response = await post(harness, "/sessions", { kind: "guest", email: "player@example.com" });

    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors?: { field?: string }[] };
    expect(problem.errors?.map((error) => error.field)).toEqual(["email"]);
  });

  it("rejects an undocumented field on PATCH /me", async () => {
    const { harness, authorization } = await signedIn();

    const response = await post(harness, "/me", { displayName: "Bao Nam", nickname: "baonam" }, authorization);

    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors?: { field?: string }[] };
    expect(problem.errors?.map((error) => error.field)).toEqual(["nickname"]);
  });

  it("rejects an undocumented identity field on PATCH /me", async () => {
    const { harness, authorization } = await signedIn();

    const response = await post(harness, "/me", { displayName: "Bao Nam", clerkUserId: "user_2" }, authorization);

    expect(response.status).toBe(422);
    expect(harness.db.account.get("acc_1")?.clerk_user_id).toBe("user_1");
  });
});

describe("responses carry only documented fields", () => {
  it("returns exactly the documented GET /me fields", async () => {
    const { harness, authorization } = await signedIn();

    const me = (await (
      await handleFetch(new Request("https://api.test/api/v1/me", { headers: { authorization } }), harness.env)
    ).json()) as Record<string, unknown>;

    // `request_id` is the envelope, not an endpoint field: `api/README.md` promises it on every response
    // ("Request tracing"), so it is checked here rather than counted as an undocumented key.
    expect(typeof me["request_id"], "envelope request_id").toBe("string");
    const documented = ME_RESPONSE.map((name) => name.split(".")[0]);
    const extra = Object.keys(me).filter((key) => key !== "request_id" && !documented.includes(key));
    expect(extra, "undocumented fields in GET /me").toEqual([]);
    expect(Object.keys(me).filter((key) => key !== "request_id").sort()).toEqual([...new Set(documented)].sort());
  });

  it("returns exactly the documented subject fields for a guest session", async () => {
    const harness = testEnv();

    const body = (await (await post(harness, "/sessions", { kind: "guest" })).json()) as Record<string, unknown>;
    // `request_id` is the documented envelope on every response (`api/README.md` § Request tracing).
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "request_id", "sessionToken", "subject"]);

    const subject = Object.keys(body["subject"] as Record<string, unknown>);
    const extra = subject.filter((key) => !SESSION_RESPONSE.includes(`subject.${key}`));
    expect(extra, "undocumented fields in subject").toEqual([]);
  });
});
