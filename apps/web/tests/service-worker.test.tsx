// @vitest-environment jsdom
/**
 * Service-worker lifecycle (`US-PWA-001` AC1, AC5).
 *
 * Registration and the "Cập nhật" prompt are one path: a new deploy parks a waiting worker, nothing
 * reloads until the player confirms, and the reload happens on `controllerchange` so the page that comes
 * back is served by the new worker.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUpdate, registerServiceWorker, watchRegistration } from "../src/app/serviceWorker";

function fakeWorker(initial: ServiceWorkerState) {
  const listeners = new Map<string, (() => void)[]>();
  const raw = {
    state: initial,
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
  };
  return {
    worker: raw as unknown as ServiceWorker,
    setState: (next: ServiceWorkerState) => {
      raw.state = next;
    },
    emit: (type: string) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

function fakeRegistration(workers: { installing?: ServiceWorker; waiting?: ServiceWorker } = {}) {
  const listeners = new Map<string, (() => void)[]>();
  const registration = {
    installing: workers.installing ?? null,
    waiting: workers.waiting ?? null,
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
  };
  return {
    registration: registration as unknown as ServiceWorkerRegistration,
    emit: (type: string) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

interface FakeContainer {
  register: ReturnType<typeof vi.fn>;
  controller: ServiceWorker | null;
  addEventListener: ReturnType<typeof vi.fn>;
  getRegistration: ReturnType<typeof vi.fn>;
}

const handlers = new Map<string, () => void>();

function stubContainer(overrides: Partial<FakeContainer> = {}): FakeContainer {
  handlers.clear();
  const container: FakeContainer = {
    register: vi.fn().mockResolvedValue(undefined),
    controller: null,
    addEventListener: vi.fn((type: string, fn: () => void) => {
      handlers.set(type, fn);
    }),
    getRegistration: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: container });
  return container;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("watchRegistration", () => {
  it("announces a worker that is already waiting when the page is controlled", () => {
    const onUpdate = vi.fn();
    const registration = fakeRegistration({ waiting: fakeWorker("installed").worker });
    watchRegistration(registration.registration, true, onUpdate);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("ignores the very first install, where no page is controlled yet", () => {
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing: installing.worker });
    const onUpdate = vi.fn();
    watchRegistration(registration.registration, false, onUpdate);
    registration.emit("updatefound");
    installing.setState("installed");
    installing.emit("statechange");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("announces a worker that finishes installing while a page is controlled", () => {
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing: installing.worker });
    const onUpdate = vi.fn();
    watchRegistration(registration.registration, true, onUpdate);
    registration.emit("updatefound");
    expect(onUpdate).not.toHaveBeenCalled();
    installing.setState("installed");
    installing.emit("statechange");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js at the root scope", () => {
    const container = stubContainer();
    registerServiceWorker(vi.fn(), true);
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does not register in a development build, where there is no sw.js to fetch", () => {
    const container = stubContainer();
    registerServiceWorker(vi.fn(), false);
    expect(container.register).not.toHaveBeenCalled();
  });

  it("reports the waiting worker of the registration it just made", async () => {
    const controller = {} as ServiceWorker;
    const container = stubContainer({ controller });
    container.register.mockResolvedValue(fakeRegistration({ waiting: fakeWorker("installed").worker }).registration);
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate, true);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it("stays silent when the browser refuses the registration", async () => {
    const container = stubContainer();
    container.register.mockRejectedValue(new Error("blocked"));
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate, true);
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("applyUpdate", () => {
  it("asks the waiting worker to activate and reloads once on controllerchange", async () => {
    const postMessage = vi.fn();
    stubContainer({ getRegistration: vi.fn().mockResolvedValue({ waiting: { postMessage } }) });
    const reload = vi.fn();
    applyUpdate(reload);
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" }));
    const onChange = handlers.get("controllerchange");
    expect(onChange).toBeTypeOf("function");
    onChange?.();
    onChange?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads even if the worker never claims the page", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    stubContainer({ getRegistration: vi.fn().mockResolvedValue({ waiting: { postMessage } }) });
    const reload = vi.fn();
    applyUpdate(reload);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads straight away when nothing is waiting", async () => {
    stubContainer({ getRegistration: vi.fn().mockResolvedValue(undefined) });
    const reload = vi.fn();
    applyUpdate(reload);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
