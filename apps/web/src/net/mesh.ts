/**
 * Peer mesh (`US-NET-001` … `US-NET-004`, `ADR-0004`).
 *
 * A star, not a full mesh: the host holds one connection per peer, so eight players are seven links
 * rather than twenty-eight. `control` is ordered and reliable (inputs, chat), `state` is unordered
 * and allowed to drop (snapshots are absolute, so a lost one costs nothing but a frame).
 */
import type { RoomState, Snapshot } from "@gbw/core";
import { CONTROL_LABEL, STATE_LABEL, createChannels } from "./channels";

export interface SignalChannel {
  readonly kind: "offer" | "answer" | "candidate";
  readonly to: string;
  readonly payload: unknown;
}

export interface MeshOptions {
  readonly selfPlayerId: string;
  readonly isHost: boolean;
  readonly iceServers: readonly RTCIceServer[];
  readonly send: (channel: SignalChannel) => void;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onControl: (from: string, message: unknown) => void;
  readonly onPeerState: (playerId: string, state: RTCPeerConnectionState) => void;
  /**
   * Sent on every new `control` channel as `host_hello {hostGeneration, seq}` (`US-NET-001` § 5), so a peer that
   * rejoined can tell which host generation its snapshots belong to.
   */
  readonly hostHello?: () => unknown;
}

export interface Mesh {
  addPeer(playerId: string): Promise<void>;
  removePeer(playerId: string): void;
  broadcast(snapshot: Snapshot): void;
  sendControl(playerId: string, message: unknown): void;
  sendControlAll(message: unknown): void;
  applySignal(from: string, kind: "offer" | "answer" | "candidate", payload: unknown): Promise<void>;
  close(): void;
}

interface Peer {
  readonly connection: RTCPeerConnection;
  control?: RTCDataChannel;
  state?: RTCDataChannel;
  /** Set once both channels exist and their listeners are attached; never re-wired afterwards. */
  wired?: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

const SNAPSHOT_HZ_ACTIVE = 10;
const SNAPSHOT_HZ_IDLE = 2;
const BUFFER_LIMIT = 64 * 1024;
/** `US-NET-001` AC3: snapshots wait for the last peer that is coming, but never longer than this. */
const READY_TIMEOUT_MS = 5_000;

export function createMesh(options: MeshOptions): Mesh {
  const peers = new Map<string, Peer>();
  let lastBroadcast = 0;
  // `null`, not `0`: the first snapshot can be broadcast at `performance.now() === 0`, and a zero sentinel would
  // reset the deadline on every call and never let the five-second escape fire.
  let firstPeerAt: number | null = null;

  /** AC3: every peer that is coming is connected, or five seconds have gone by — whichever comes first. */
  const ready = (): boolean => {
    if (peers.size === 0) return false;
    if (firstPeerAt === null) firstPeerAt = performance.now();
    let all = true;
    for (const peer of peers.values()) {
      if (peer.connection.connectionState !== "connected") all = false;
    }
    return all || performance.now() - firstPeerAt >= READY_TIMEOUT_MS;
  };

  const wireChannels = (playerId: string, peer: Peer): void => {
    const control = peer.control;
    const state = peer.state;
    // A half-wired peer used to receive snapshots on `control` and controls on `state` (`US-NET-001` AC1): both
    // channels must exist before either listener is attached.
    if (!control || !state || peer.wired) return;
    peer.wired = true;
    if (options.isHost && options.hostHello) {
      const hello = (): void => {
        if (control.readyState === "open") control.send(JSON.stringify(options.hostHello?.()));
      };
      if (control.readyState === "open") hello();
      else control.addEventListener("open", hello);
    }
    control.addEventListener("message", (event) => {
      try {
        options.onControl(playerId, JSON.parse(String(event.data)) as unknown);
      } catch {
        // Ignore a frame we cannot read rather than killing the match.
      }
    });
    state.addEventListener("message", (event) => {
      try {
        options.onSnapshot(JSON.parse(String(event.data)) as Snapshot);
      } catch {
        // A malformed snapshot is dropped; the next one arrives within 500 ms.
      }
    });
  };

  const createPeer = async (playerId: string): Promise<Peer> => {
    const connection = new RTCPeerConnection({ iceServers: [...options.iceServers] });
    const peer: Peer = { connection, pendingCandidates: [] };
    peers.set(playerId, peer);
    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        options.send({ kind: "candidate", to: playerId, payload: event.candidate.toJSON() });
      }
    });
    connection.addEventListener("connectionstatechange", () => {
      options.onPeerState(playerId, connection.connectionState);
    });
    if (options.isHost) {
      const { control, state } = createChannels(connection);
      peer.control = control;
      peer.state = state;
      wireChannels(playerId, peer);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      options.send({ kind: "offer", to: playerId, payload: offer });
    } else {
      connection.addEventListener("datachannel", (event) => {
        const channel = event.channel;
        if (channel.label === CONTROL_LABEL) peer.control = channel;
        else if (channel.label === STATE_LABEL) peer.state = channel;
        else return;
        wireChannels(playerId, peer);
      });
    }
    return peer;
  };

  return {
    async addPeer(playerId) {
      if (peers.has(playerId)) return;
      await createPeer(playerId);
    },
    removePeer(playerId) {
      const peer = peers.get(playerId);
      if (!peer) return;
      peer.control?.close();
      peer.state?.close();
      peer.connection.close();
      peers.delete(playerId);
    },
    broadcast(snapshot) {
      if (!ready()) return;
      const now = performance.now();
      const active = snapshot.turn.activeSlot >= 0;
      const interval = 1000 / (active ? SNAPSHOT_HZ_ACTIVE : SNAPSHOT_HZ_IDLE);
      if (now - lastBroadcast < interval) return;
      lastBroadcast = now;
      const payload = JSON.stringify(snapshot);
      for (const peer of peers.values()) {
        const channel = peer.state;
        if (!channel || channel.readyState !== "open") continue;
        if (channel.bufferedAmount > BUFFER_LIMIT) continue;
        channel.send(payload);
      }
    },
    sendControl(playerId, message) {
      const channel = peers.get(playerId)?.control;
      if (channel?.readyState === "open") channel.send(JSON.stringify(message));
    },
    sendControlAll(message) {
      const payload = JSON.stringify(message);
      for (const peer of peers.values()) {
        if (peer.control?.readyState === "open") peer.control.send(payload);
      }
    },
    async applySignal(from, kind, payload) {
      let peer = peers.get(from);
      if (!peer) peer = await createPeer(from);
      if (kind === "offer") {
        await peer.connection.setRemoteDescription(payload as RTCSessionDescriptionInit);
        for (const candidate of peer.pendingCandidates.splice(0)) {
          await peer.connection.addIceCandidate(candidate).catch(() => undefined);
        }
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        options.send({ kind: "answer", to: from, payload: answer });
        return;
      }
      if (kind === "answer") {
        await peer.connection.setRemoteDescription(payload as RTCSessionDescriptionInit);
        for (const candidate of peer.pendingCandidates.splice(0)) {
          await peer.connection.addIceCandidate(candidate).catch(() => undefined);
        }
        return;
      }
      const candidate = payload as RTCIceCandidateInit;
      if (!peer.connection.remoteDescription) {
        peer.pendingCandidates.push(candidate);
        return;
      }
      await peer.connection.addIceCandidate(candidate).catch(() => undefined);
    },
    close() {
      for (const peer of peers.values()) {
        peer.control?.close();
        peer.state?.close();
        peer.connection.close();
      }
      peers.clear();
    },
  };
}

/** The single place that decides who the host of a room is (`US-ROOM-005`). */
export function hostOf(room: RoomState): string | null {
  return room.hostPlayerId;
}
