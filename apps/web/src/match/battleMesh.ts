/**
 * The peer mesh's callbacks (`US-NET-001` … `US-NET-004`).
 *
 * A star, not a full mesh: the host opens one link per peer. This module is the ingress half — what a snapshot or a
 * control frame does when it arrives — and it is built fresh on every election because a link to a superseded host
 * would stream state the peers are told to discard anyway (`US-NET-001` AC6).
 */
import { applyInput, toSnapshot, type MatchState } from "@gbw/core";
import { createMesh, type Mesh } from "../net/mesh";
import { isChatFrame } from "../net/chat";
import { countRejectedSnapshot } from "../net/diagnostics";
import { isStaleInput, toPackedSnapshot, type InputFrame } from "../net/input";
import { resyncFromSnapshot } from "../net/resync";
import type { PlannedMatch } from "../lib/plan";
import type { MatchChatMessage } from "./useMatchChat";
import type { CommitState, MatchWiring } from "./wiring";

export interface BattleMeshOptions {
  readonly plan: PlannedMatch;
  readonly isHost: boolean;
  readonly iceServers: readonly RTCIceServer[];
  readonly wiring: MatchWiring;
  readonly commit: CommitState;
  readonly setChat: (chat: MatchChatMessage | null) => void;
  readonly setBanner: (banner: string | null) => void;
}

export function createBattleMesh(options: BattleMeshOptions): Mesh {
  const { plan, isHost, iceServers, wiring, commit, setChat, setBanner } = options;
  const { mesh, socket, hostGeneration, hostPlayerId, stateRef, lastSnapshotAt, slotsByPlayer, appliedInputs } = wiring;

  return createMesh({
    selfPlayerId: plan.playerId,
    isHost,
    iceServers,
    // `host_hello` on every new control channel (`US-NET-001` § 5).
    hostHello: () => ({ t: "host_hello", hostGeneration: hostGeneration.current, seq: wiring.seq.current }),
    send: (channel) =>
      socket.current?.send({
        t: "signal",
        to: channel.to,
        payload:
          channel.kind === "candidate"
            ? { kind: "candidate", candidate: channel.payload }
            : { kind: channel.kind, sdp: (channel.payload as RTCSessionDescriptionInit).sdp ?? "" },
      }),
    onSnapshot: (snapshot) => {
      lastSnapshotAt.current = Date.now();
      const current = stateRef.current;
      if (!current) return;
      const synced = resyncFromSnapshot(current, snapshot, hostGeneration.current);
      hostGeneration.current = synced.hostGeneration;
      if (synced.applied) commit(synced.state, []);
      // A snapshot from a host that lost the election is dropped, and the drop is counted so a support
      // check can tell a flickering connection from a client that never learned about the promotion.
      else countRejectedSnapshot();
    },
    onControl: (from, message) => {
      const current = stateRef.current;
      if (!current) return;
      // A phrase is not an input: it never changes the match, so it is handled before the turn guard and
      // is never attributed by `seq` (`US-MATCH-004` AC3).
      if (isChatFrame(message)) {
        const slot = slotsByPlayer.current.get(from);
        if (slot === undefined) return;
        setChat({ slot, kind: message.kind, id: message.id });
        // The host is the star's centre: a peer's phrase has to reach the other peers, and not come back
        // to the sender, which already showed it.
        if (hostPlayerId.current === plan.playerId) {
          for (const playerId of slotsByPlayer.current.keys()) {
            if (playerId !== from && playerId !== plan.playerId) mesh.current?.sendControl(playerId, message);
          }
        }
        return;
      }
      const frame = message as Partial<InputFrame> & { t?: string };
      if (frame?.t !== "input") return;
      // Only the host runs the simulation; a peer that receives an input has already made a mistake.
      if (hostPlayerId.current !== plan.playerId) return;
      const slot = slotsByPlayer.current.get(from);
      if (slot === undefined || frame.turn !== current.turn.number) return;
      // AC4: an input older than the last one applied for this turn is dropped, not answered.
      const key = `${slot}:${current.turn.number}`;
      if (isStaleInput(frame as InputFrame, appliedInputs.current.get(key))) return;
      appliedInputs.current.set(key, frame.seq ?? 0);
      const input =
        frame.kind === "skip"
          ? { kind: "skip" as const, slot, seq: frame.seq ?? 0 }
          : {
              kind: "fire" as const,
              slot,
              weaponSlot: frame.weaponSlot ?? 0,
              angle: frame.angle ?? 0,
              force: frame.force ?? 0,
              seq: frame.seq ?? 0,
            };
      const result = applyInput(current, input as Parameters<typeof applyInput>[1], Date.now());
      commit(result.state as MatchState, result.events);
      // A resolved turn is published at once, so the shotter does not wait for the 100 ms tick (AC2, § 5).
      const carved = result.events.some((event) => event.kind === "shot" && event.carved);
      const snapshot = toSnapshot(result.state, hostGeneration.current, { includeTerrain: carved });
      mesh.current?.broadcast(snapshot);
      socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
    },
    onPeerState: (playerId, connectionState) => {
      if (connectionState === "failed" || connectionState === "disconnected") {
        setBanner(`${playerId}: ${connectionState}`);
      }
    },
  });
}
