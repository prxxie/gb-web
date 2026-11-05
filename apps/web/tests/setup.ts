import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; the orientation gate and the camera both ask for it. A real browser derives
// `orientation: landscape` from the viewport's shape, so the stub does the same instead of always saying no.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => {
      const matches = query.includes("(orientation: landscape)") ? window.innerWidth > window.innerHeight : false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      };
    },
  });
}
