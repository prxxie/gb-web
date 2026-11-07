/**
 * The two channels every peer link carries (`US-NET-001` AC1, AC2, `ADR-0004`).
 *
 * `control` is ordered and reliable: an input that arrives out of order or not at all is a lost turn. `state` is
 * unordered with `maxRetransmits: 0`: a snapshot is absolute, so a retransmit only delays the newer one, and a lost
 * one costs a frame (`docs/02-reference/api/signaling.md` § Snapshot payload).
 *
 * The host creates both channels before the offer so they are negotiated in-band; the peer reads them from
 * `datachannel` events, which is why the names matter — they are the only thing that tells the two apart.
 */
export const CONTROL_LABEL = "control";
export const STATE_LABEL = "state";

/** Ordered and reliable: a lost or reordered input is a lost or reordered turn. */
export const CONTROL_OPTIONS: RTCDataChannelInit = { ordered: true };

/** Unordered, no retransmits: the next snapshot supersedes a lost one within 500 ms. */
export const STATE_OPTIONS: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };

export interface Channels {
  readonly control: RTCDataChannel;
  readonly state: RTCDataChannel;
}

/** Create both channels on a host-side connection, before the offer is sent. */
export function createChannels(connection: RTCPeerConnection): Channels {
  return {
    control: connection.createDataChannel(CONTROL_LABEL, CONTROL_OPTIONS),
    state: connection.createDataChannel(STATE_LABEL, STATE_OPTIONS),
  };
}

/**
 * Resolve `true` once the connection reports `connected`, `false` when it fails, closes, or the timeout fires first.
 * `US-NET-001` AC3 uses it as the "or 5 s, whichever first" gate before the first snapshot goes out.
 */
export function awaitPeerConnected(connection: RTCPeerConnection, timeoutMs: number): Promise<boolean> {
  if (connection.connectionState === "connected") return Promise.resolve(true);
  if (connection.connectionState === "failed" || connection.connectionState === "closed") {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      connection.removeEventListener("connectionstatechange", onChange);
      clearTimeout(timer);
      resolve(connected);
    };
    const onChange = (): void => {
      if (connection.connectionState === "connected") finish(true);
      else if (connection.connectionState === "failed" || connection.connectionState === "closed") finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    connection.addEventListener("connectionstatechange", onChange);
  });
}
