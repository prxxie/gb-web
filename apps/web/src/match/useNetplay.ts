/**
 * Joining the room (`US-NET-001`, `US-NET-002` AC6, `US-ROOM-004`).
 *
 * The socket carries signalling and server frames; the mesh carries state and inputs. Both are opened once per room and
 * torn down together, and a migration moves the role between them rather than reopening the room.
 */
import { useEffect } from "react";
import { toSnapshot } from "@gbw/core";
import { api } from "../lib/api";
import { currentSession } from "../lib/session";
import type { RecordedMatch } from "../lib/result";
import { adoptHostChanged } from "../net/migration";
import { toPackedSnapshot, unpackSnapshot } from "../net/input";
import { resyncFromSnapshot } from "../net/resync";
import { countRejectedSnapshot } from "../net/diagnostics";
import { connectWithReconnect } from "../net/reconnect";
import type { ServerMessage } from "../net/signaling";
import type { Mesh } from "../net/mesh";
import type { Translator } from "../i18n";
import type { PlannedMatch } from "../lib/plan";
import { createBattleMesh } from "./battleMesh";
import type { MatchChatMessage } from "./useMatchChat";
import type { CommitState, MatchWiring } from "./wiring";

export interface NetplayOptions {
  readonly plan: PlannedMatch | null;
  /** The mobile this client plays, for the room's member record. */
  readonly mobileId: string;
  readonly setHosting: (hosting: boolean) => void;
  readonly commit: CommitState;
  readonly wiring: MatchWiring;
  readonly setChat: (chat: MatchChatMessage | null) => void;
  readonly setBanner: (banner: string | null) => void;
  readonly onRecorded: (recorded: RecordedMatch) => void;
  readonly t: Translator;
}

export function useNetplay(options: NetplayOptions): void {
  const { plan, mobileId, setHosting, commit, wiring, setChat, setBanner, onRecorded, t } = options;
  const { mesh, socket, hostGeneration, hostPlayerId, absent, slotsByPlayer, lastSnapshotAt, stateRef } = wiring;

  // Online: join the room socket and the peer mesh.
  useEffect(() => {
    if (!plan || plan.kind !== "online") return;
    const session = currentSession();
    if (!session) return;
    let cancelled = false;
    const base = window.location.origin.replace(/^http/, "ws");

    let iceServers: RTCIceServer[] = [];
    const buildMesh = (hosting: boolean): Mesh =>
      createBattleMesh({ plan, isHost: hosting, iceServers, wiring, commit, setChat, setBanner });

    void api.turnCredentials(session.token).then((credentials) => {
      if (cancelled) return;
      iceServers = credentials.iceServers.map((server) => ({
        urls: Array.isArray(server.urls) ? server.urls : [server.urls],
        ...(server.username ? { username: server.username } : {}),
        ...(server.credential ? { credential: server.credential } : {}),
      }));
      mesh.current = buildMesh(hostPlayerId.current === plan.playerId);
    });

    socket.current = connectWithReconnect({
      wsUrl: `${base}/api/v1/rooms/${plan.roomCode}/ws`,
      token: session.token,
      displayName: session.subject.displayName,
      mobileId,
      onMessage: (message: ServerMessage) => {
        if (message.t === "match_recorded") {
          // The room's answer to `match_end`: the deltas the result screen renders (`US-RANK-005` AC1).
          onRecorded({
            matchId: message.matchId,
            ranked: message.ranked,
            // The record's own reason (`US-RANK-005` AC2): `ruleset_mismatch` can never be derived here.
            rankedReason: message.rankedReason ?? null,
            ratings: message.ratings,
            // The room's verdict on each seat, so the screen prints the record's result and not the one this
            // client guessed from the winner' team.
            results: message.players,
          });
          return;
        }
        if (message.t === "signal") {
          const signal = message.payload;
          void mesh.current?.applySignal(
            message.from,
            signal.kind,
            signal.kind === "candidate" ? signal.candidate : { type: signal.kind, sdp: signal.sdp },
          );
          return;
        }
        if (message.t === "host_changed") {
          setBanner(t("match.hostChanged"));
          // Migration rebuilds the star (`US-NET-001` AC6): the elected host opens one link per remaining member and
          // everyone drops the links that pointed at the old host. A link to a superseded host would stream state the
          // peers are told to discard anyway, so the mesh is rebuilt from scratch.
          hostGeneration.current = Math.max(hostGeneration.current, message.hostGeneration);
          hostPlayerId.current = message.hostPlayerId;
          const promoted = message.hostPlayerId === plan.playerId;
          setHosting(promoted);
          mesh.current?.close();
          mesh.current = iceServers.length === 0 ? null : buildMesh(promoted);
          for (const member of message.room.members) {
            if (member.playerId !== plan.playerId) void mesh.current?.addPeer(member.playerId);
          }
          // The DO hands the promoted client the snapshot it kept: adopt it, then publish once so the peers and
          // the replay any graced member receives carry the new host's numbers (`US-NET-003` AC1, AC4).
          if (promoted) {
            const adoption = adoptHostChanged(stateRef.current, message);
            hostGeneration.current = adoption.hostGeneration;
            if (adoption.state) {
              commit(adoption.state, []);
              const snapshot = toSnapshot(adoption.state, adoption.hostGeneration);
              mesh.current?.broadcast(snapshot);
              socket.current?.send({ t: "snapshot_push", snapshot: toPackedSnapshot(snapshot) });
            }
          }
          return;
        }
        if (message.t === "peer_joined") {
          void mesh.current?.addPeer(message.playerId);
          return;
        }
        if (message.t === "snapshot_state") {
          // The relay and the rejoin replay share one name: a returning client lands the host's hp, turn
          // and wind without a reload (`US-ROOM-004` AC2, AC5).
          lastSnapshotAt.current = Date.now();
          const current = stateRef.current;
          if (!current) return;
          const synced = resyncFromSnapshot(current, unpackSnapshot(message.snapshot), hostGeneration.current);
          hostGeneration.current = synced.hostGeneration;
          if (synced.applied) commit(synced.state, []);
          else countRejectedSnapshot();
          return;
        }
        if (message.t === "room_state") {
          // Who is present decides whose turn is skipped (`US-ROOM-004` AC3/AC7), and the generation
          // decides which snapshots are still valid (AC5).
          absent.current = message.room.members
            .filter((member) => member.connectionState !== "connected")
            .map((member) => member.slot);
          hostGeneration.current = Math.max(hostGeneration.current, message.room.hostGeneration);
          if (message.room.hostPlayerId !== hostPlayerId.current) {
            hostPlayerId.current = message.room.hostPlayerId;
            setHosting(message.room.hostPlayerId === plan.playerId);
            mesh.current?.close();
            mesh.current = iceServers.length === 0 ? null : buildMesh(message.room.hostPlayerId === plan.playerId);
          }
          for (const member of message.room.members) {
            slotsByPlayer.current.set(member.playerId, member.slot);
            if (member.playerId !== plan.playerId) void mesh.current?.addPeer(member.playerId);
          }
        }
      },
      // A transient drop reconnects inside the grace window (`US-ROOM-004` AC7); a code the server chose
      // means retrying would only repeat the answer.
      onReconnecting: () => setBanner(t("match.reconnecting")),
      onReconnected: () => setBanner(null),
      onFatal: (closeCode) => {
        if (closeCode === 4401) setBanner(t("signIn.title"));
        else setBanner(t("match.disconnected"));
      },
    });

    return () => {
      cancelled = true;
      socket.current?.close();
      socket.current = null;
      mesh.current?.close();
      mesh.current = null;
    };
    // One socket and one mesh per room, not once per render: the effect reads the wiring's refs, which are stable, so
    // only a different room or seat may reopen them.
  }, [plan?.roomCode, plan?.playerId]);
}
