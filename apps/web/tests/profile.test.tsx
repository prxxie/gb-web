// @vitest-environment jsdom
/**
 * `TC-AUTH-140` — the profile screen's save and avatar paths (`US-AUTH-003` AC4–AC6).
 *
 * The API client is faked at its module boundary, so the page is exercised exactly as the browser
 * runs it: it gets an `ApiError` for a refusal, and the DOM is what the player sees. `ApiError` itself
 * is the real class — the page branches on its `type` and `fields[]`, which is the contract under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider, SessionProvider } from "../src/app/providers";
import { ApiError, type ProfileResponse } from "../src/lib/api";
import type * as ApiModule from "../src/lib/api";
import { AVATAR_IDS, ProfilePage } from "../src/routes/ProfilePage";
import copy from "../src/i18n/vi.json";

const client = vi.hoisted(() => ({
  me: vi.fn(),
  history: vi.fn(),
  patchMe: vi.fn(),
  deleteMe: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: client };
});

const SESSION = {
  token: "test-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "account", accountId: "acc_1", displayName: "Bao", avatarId: "avatar-03" },
};

const PROFILE: ProfileResponse = {
  accountId: "acc_1",
  displayName: "Bao",
  avatarId: "avatar-03",
  rating: 1234,
  ratedMatches: 7,
  stats: { matches: 3, wins: 2, losses: 1, abandons: 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
  deletionScheduledFor: null,
};

function mount(): ReturnType<typeof render> {
  return render(
    <LocaleProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={["/profile"]}>
          <ProfilePage />
        </MemoryRouter>
      </SessionProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("gbw.session", JSON.stringify(SESSION));
  client.me.mockResolvedValue(PROFILE);
  client.history.mockResolvedValue({ items: [], next_cursor: null });
  client.patchMe.mockReset();
  client.deleteMe.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const nameInput = (): HTMLElement => screen.getByLabelText(copy["profile.displayName"]);

describe("TC-AUTH-140: a refused rename (AC4)", () => {
  it("shows the new name at once and puts the old one back with a 409 field error", async () => {
    let refuse: (error: unknown) => void = () => undefined;
    client.patchMe.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    mount();
    await screen.findByTestId("profile-name");

    fireEvent.change(nameInput(), { target: { value: "Bao Moi" } });
    await userEvent.click(screen.getByRole("button", { name: copy["profile.save"] }));

    // Optimistic: the saved name is on screen before the server has answered.
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Bao Moi");
    expect(client.patchMe).toHaveBeenCalledWith(SESSION.token, { displayName: "Bao Moi" });

    refuse(new ApiError("display-name-taken", 409, "That name is already in use"));

    const fieldError = await screen.findByRole("alert");
    expect(fieldError).toHaveTextContent(copy["errors.display-name-taken"]);
    expect(nameInput()).toHaveValue("Bao");
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Bao");
    expect(screen.queryByText(copy["profile.saved"])).toBeNull();
  });

  it("puts a 422 for displayName under the same field", async () => {
    client.patchMe.mockRejectedValue(
      new ApiError("validation", 422, "invalid", undefined, [{ field: "displayName", detail: "too short" }]),
    );
    mount();
    await screen.findByTestId("profile-name");

    fireEvent.change(nameInput(), { target: { value: "Bo" } });
    await userEvent.click(screen.getByRole("button", { name: copy["profile.save"] }));

    const fieldError = await screen.findByRole("alert");
    expect(fieldError).toHaveTextContent(copy["errors.validation"]);
    expect(nameInput()).toHaveValue("Bao");
    expect(client.patchMe.mock.calls.at(-1)?.[1]).toEqual({ displayName: "Bo" });
  });
});

describe("TC-AUTH-140: the avatar picker (AC5)", () => {
  it("offers the avatar-NN contract ids, not loadout parts", async () => {
    mount();
    await screen.findByTestId("profile-name");

    const picker = screen.getByLabelText(copy["profile.avatar"]) as HTMLSelectElement;
    expect(picker).toHaveValue("avatar-03");
    expect([...picker.options].map((option) => option.value)).toEqual([...AVATAR_IDS]);
  });

  it("saves the chosen avatar immediately and shows it after a reload", async () => {
    client.patchMe.mockResolvedValue({ ...PROFILE, avatarId: "avatar-09" });
    mount();
    await screen.findByTestId("profile-name");

    await userEvent.selectOptions(screen.getByLabelText(copy["profile.avatar"]), "avatar-09");

    await waitFor(() => expect(client.patchMe).toHaveBeenCalledWith(SESSION.token, { avatarId: "avatar-09" }));
    expect(await screen.findByText(copy["profile.saved"])).toBeInTheDocument();
    expect(screen.getByTestId("profile-avatar")).toHaveTextContent("avatar-09");

    // A reload re-reads `GET /me`; the id the server now holds is the one the picker shows.
    cleanup();
    client.me.mockResolvedValue({ ...PROFILE, avatarId: "avatar-09" });
    mount();
    await screen.findByTestId("profile-name");
    expect(screen.getByTestId("profile-avatar")).toHaveTextContent("avatar-09");
    expect(screen.getByLabelText(copy["profile.avatar"])).toHaveValue("avatar-09");
  });

  it("restores the previous avatar when the server refuses the id", async () => {
    client.patchMe.mockRejectedValue(
      new ApiError("validation", 422, "invalid", undefined, [{ field: "avatarId", detail: "unknown avatar" }]),
    );
    mount();
    await screen.findByTestId("profile-name");

    await userEvent.selectOptions(screen.getByLabelText(copy["profile.avatar"]), "avatar-11");

    const fieldError = await screen.findByRole("alert");
    expect(fieldError).toHaveTextContent(copy["errors.validation"]);
    expect(screen.getByLabelText(copy["profile.avatar"])).toHaveValue("avatar-03");
    expect(screen.getByTestId("profile-avatar")).toHaveTextContent("avatar-03");
  });
});

/** The identity the rest of the app reads: a room join takes its name and avatar from here. */
const storedSubject = (): { displayName: string; avatarId?: string } =>
  (JSON.parse(sessionStorage.getItem("gbw.session") ?? "{}") as { subject: { displayName: string; avatarId?: string } })
    .subject;

describe("US-AUTH-003 AC5/AC7: the accepted identity is stored", () => {
  it("writes the renamed identity into the session, so the next room join uses it", async () => {
    client.patchMe.mockResolvedValue({ ...PROFILE, displayName: "Bao Moi" });
    mount();
    await screen.findByTestId("profile-name");

    fireEvent.change(nameInput(), { target: { value: "Bao Moi" } });
    await userEvent.click(screen.getByRole("button", { name: copy["profile.save"] }));

    await screen.findByText(copy["profile.saved"]);
    expect(storedSubject()).toMatchObject({ displayName: "Bao Moi", avatarId: "avatar-03" });
  });

  it("writes the accepted avatar into the session (AC5)", async () => {
    client.patchMe.mockResolvedValue({ ...PROFILE, avatarId: "avatar-09" });
    mount();
    await screen.findByTestId("profile-name");

    await userEvent.selectOptions(screen.getByLabelText(copy["profile.avatar"]), "avatar-09");

    await screen.findByText(copy["profile.saved"]);
    expect(storedSubject()).toMatchObject({ displayName: "Bao", avatarId: "avatar-09" });
  });

  it("leaves the stored session alone when the server refuses the edit", async () => {
    client.patchMe.mockRejectedValue(new ApiError("display-name-taken", 409, "That name is already in use"));
    mount();
    await screen.findByTestId("profile-name");

    fireEvent.change(nameInput(), { target: { value: "Bao Moi" } });
    await userEvent.click(screen.getByRole("button", { name: copy["profile.save"] }));

    await screen.findByRole("alert");
    expect(storedSubject()).toMatchObject({ displayName: "Bao", avatarId: "avatar-03" });
  });
});

describe("US-AUTH-003 AC6: a display name is text, never markup", () => {
  it("renders a name containing <b> and & as characters", async () => {
    const hostile = "Bao <b>&</b>";
    client.me.mockResolvedValue({ ...PROFILE, displayName: hostile });
    const { container } = mount();
    await screen.findByTestId("profile-name");

    expect(screen.getByTestId("profile-name").textContent).toBe(hostile);
    expect(nameInput()).toHaveValue(hostile);
    expect(container.querySelector("b")).toBeNull();
    expect(container.innerHTML).not.toContain("<b>");
    expect(container.textContent).toContain("Bao <b>&</b>");
  });
});
