/**
 * Display names — `docs/02-reference/api/accounts.md` (PATCH /me), `docs/02-reference/data/accounts.md`
 * (normalisation and uniqueness), TC-AUTH-101 and TC-AUTH-102.
 *
 * TC-AUTH-102 is the boundary case the client renders as a field error: 1 or 17 characters must be a
 * `422` whose `errors[]` names the field, never a silent trim and never a 400.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { displayNameKey, isValidDisplayName } from "../src/routes/accounts";
import { mintSession } from "../src/lib/session";
import { TEST_SECRET, testEnv, type TestEnv } from "./support/fake-worker";

async function harnessWithPlayer(displayName = "Bao Tran"): Promise<{ harness: TestEnv; authorization: string }> {
  const harness = testEnv();
  harness.db.seedPlayer({ accountId: "acc_1", clerkUserId: "user_1", displayName });
  const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);
  return { harness, authorization: `Bearer ${session.token}` };
}

const patchMe = (harness: TestEnv, authorization: string, body: unknown): Promise<Response> =>
  handleFetch(
    new Request("https://api.test/api/v1/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    }),
    harness.env,
  );

describe("displayNameKey", () => {
  it("strips Vietnamese diacritics, lowercases and collapses whitespace", () => {
    expect(displayNameKey("  Nguyễn   Văn  An ")).toBe("nguyen van an");
    expect(displayNameKey("VĂN")).toBe("van");
    expect(displayNameKey("Bao")).toBe(displayNameKey("bAo"));
  });

  it("normalises a decomposed input the same way as its composed form", () => {
    expect(displayNameKey("Nguye\u0302\u0303n")).toBe(displayNameKey("Nguyễn"));
  });
});

describe("isValidDisplayName", () => {
  it("accepts 2 and 16 characters and rejects 1 and 17", () => {
    expect(isValidDisplayName("Ba")).toBe(true);
    expect(isValidDisplayName("a".repeat(16))).toBe(true);
    expect(isValidDisplayName("B")).toBe(false);
    expect(isValidDisplayName("a".repeat(17))).toBe(false);
  });

  it("rejects empty, whitespace-only, emoji and punctuation-only names", () => {
    for (const value of ["", "   ", "Bao 🎯", "!!!", "__", "Bao!!"]) {
      expect(isValidDisplayName(value), `${value} must be invalid`).toBe(false);
    }
  });

  it("requires at least one letter so a name cannot be digits only", () => {
    expect(isValidDisplayName("1234")).toBe(false);
    expect(isValidDisplayName("Player 1")).toBe(true);
  });
});

describe("PATCH /me — display name rules", () => {
  it("TC-AUTH-102 : a 1-character name is a 422 naming displayName", async () => {
    const { harness, authorization } = await harnessWithPlayer();

    const response = await patchMe(harness, authorization, { displayName: "B" });

    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors?: { field: string; detail: string }[] };
    expect(problem.errors?.map((error) => error.field)).toEqual(["displayName"]);
    expect(harness.db.profile.get("acc_1")?.["display_name"]).toBe("Bao Tran");
  });

  it("TC-AUTH-102 : a 17-character name is a 422 naming displayName", async () => {
    const { harness, authorization } = await harnessWithPlayer();

    const response = await patchMe(harness, authorization, { displayName: "a".repeat(17) });

    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors?: { field: string }[] };
    expect(problem.errors?.map((error) => error.field)).toEqual(["displayName"]);
    expect(harness.db.profile.get("acc_1")?.["display_name"]).toBe("Bao Tran");
  });

  it("TC-AUTH-101 : a name that normalises onto another player's is a 409 and changes nothing", async () => {
    const harness = testEnv();
    harness.db.seedPlayer({ accountId: "acc_1", displayName: "Bao Tran" });
    harness.db.seedPlayer({ accountId: "acc_2", displayName: "Nguyen Van An" });
    const session = await mintSession({ kind: "account", guestId: null, accountId: "acc_1" }, TEST_SECRET);

    const response = await patchMe(harness, `Bearer ${session.token}`, { displayName: "  nguyễn  văn   an " });

    expect(response.status).toBe(409);
    expect(String(((await response.json()) as Record<string, unknown>)["type"])).toContain("display-name-taken");
    expect(harness.db.profile.get("acc_1")?.["display_name"]).toBe("Bao Tran");
    expect(harness.db.profile.get("acc_2")?.["display_name"]).toBe("Nguyen Van An");
  });

  it("lets a player re-case their own name", async () => {
    const { harness, authorization } = await harnessWithPlayer("Bao Tran");

    const response = await patchMe(harness, authorization, { displayName: "BAO TRAN" });

    expect(response.status).toBe(200);
    expect(harness.db.profile.get("acc_1")?.["display_name"]).toBe("BAO TRAN");
  });

  it("stores the trimmed name and returns it in the profile body", async () => {
    const { harness, authorization } = await harnessWithPlayer();

    const response = await patchMe(harness, authorization, { displayName: "  Bao  " });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["displayName"]).toBe("Bao");
    expect(harness.db.profile.get("acc_1")?.["display_name"]).toBe("Bao");
    expect(harness.db.profile.get("acc_1")?.["display_name_key"]).toBe("bao");
  });

  it("accepts exactly 16 characters", async () => {
    const { harness, authorization } = await harnessWithPlayer();

    const response = await patchMe(harness, authorization, { displayName: "Bảo Nguyễn Văn A" });

    expect("Bảo Nguyễn Văn A".length).toBe(16);
    expect(response.status).toBe(200);
  });
});
