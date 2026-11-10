/**
 * The HTTP actions the object answers besides the socket: `join`, `leave` and `state` (`docs/02-reference/api/rooms.md`).
 *
 * Each answers with the response plus the room to commit and the frames that announce it, so `persist()`, the
 * delivery and the sweep stay on the object and this file keeps the shapes a client sees.
 */
import type { JoinRequest, RoomSettings, RoomState } from "@gbw/core";
import { withPromotion } from "./election.js";
import { planDeparture, planJoin } from "./presence.js";
import { hostChanged, publicRoom, roomState, type Outgoing } from "./wire.js";

export interface RestOutcome {
  readonly response: Response;
  /** The room to commit before the frames go out. */
  readonly room?: RoomState;
  readonly out?: readonly Outgoing[];
  /** `join` re-arms the sweep: the seat it added may be the last one in the room. */
  readonly sweep?: boolean;
}

/** The web app joins the room *before* opening the socket, so the roster exists when `room_state` lands. */
export async function joinRequest(request: Request, room: RoomState): Promise<RestOutcome> {
  const body = (await request.json()) as JoinRequest & {
    roomCode?: string;
    settings?: Partial<RoomSettings>;
  };
  const plan = planJoin(room, body);
  if (plan.existing) {
    return {
      response: Response.json({ room: publicRoom(plan.existing.room), member: plan.existing.member }),
      room: plan.existing.room,
    };
  }
  if (plan.rejection) return { response: Response.json({ type: plan.rejection.type }, { status: plan.rejection.status }) };
  // `NFR-07`: a host that comes back inside its grace window keeps its slot, not the role — the room has already
  // been handed on, and taking it back would be a second silent migration.
  const joined = plan.promoted ? withPromotion(plan.room, plan.promoted) : plan.room;
  return {
    response: Response.json({ room: publicRoom(joined), member: plan.member }),
    room: joined,
    out: plan.promoted ? [{ to: null, payload: hostChanged(joined) }] : [],
    sweep: true,
  };
}

/** `POST …/leave`: the seat goes now, and the roster is re-sent to whoever is left. */
export async function leaveRequest(request: Request, room: RoomState): Promise<RestOutcome> {
  const { playerId } = (await request.json()) as { playerId: string };
  const plan = planDeparture(room, playerId);
  return {
    response: Response.json({ room: publicRoom(plan.room) }),
    room: plan.room,
    out: [...plan.out, { to: null, payload: roomState(plan.room) }],
  };
}

/** `GET …/state`: the roster as the browser sees it, with the snapshot reduced to its sequence (`TC-ROOM-055`). */
export function stateResponse(room: RoomState): Response {
  return Response.json(publicRoom(room));
}
