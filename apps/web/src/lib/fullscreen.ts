/**
 * Fullscreen on the first tap (`US-MATCH-007` AC1), where the API exists.
 *
 * The request has to come from a user gesture, so it is armed on the element rather than called at mount; it runs
 * once per mount. iPhone Safari has no Fullscreen API on non-video elements, so absence is not an error — the page
 * fills the viewport through its own layout instead (`NFR-19`).
 */
export interface FullscreenElement {
  requestFullscreen?: (() => Promise<void>) | undefined;
}

/** Ask for fullscreen if the element can, swallowing the rejection Safari throws for a gesture it dislikes. */
export function requestFullscreen(target: FullscreenElement | null): void {
  if (!target || typeof target.requestFullscreen !== "function") return;
  try {
    void Promise.resolve(target.requestFullscreen()).catch(() => undefined);
  } catch {
    // A synchronous throw (an older WebKit build) is the same outcome as a refusal: stay in the page.
  }
}

/**
 * Arm a one-shot fullscreen request on the first pointer-down reaching `target`. Returns the disposer the scene
 * calls when it shuts down, so a remounted match does not stack listeners.
 */
export function armFullscreen(target: (HTMLElement & FullscreenElement) | null): () => void {
  if (!target) return () => undefined;
  const fire = (): void => {
    target.removeEventListener("pointerdown", fire);
    requestFullscreen(target);
  };
  target.addEventListener("pointerdown", fire);
  return () => target.removeEventListener("pointerdown", fire);
}
