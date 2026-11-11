/**
 * The battlefield renderer (`US-MATCH-001`).
 *
 * Phaser owns pixels and nothing else: state arrives from the host (or the local engine in a bot
 * match), and this scene draws whatever it is given. No rule lives here, so a re-render can never
 * change the outcome (`NFR-22`, `ADR-0004`).
 *
 * What the shot does on screen comes from the engine's own `shot` event — its `path`, its `flightMs` and its `hits` —
 * so the shell the player watches is the shell that was resolved, never a second simulation that could disagree.
 */
import Phaser from "phaser";
import {
  TUNABLES,
  defaultWindow,
  windowOnBoth,
  clampWindow,
  panBy,
  pinchTo,
  rulerLayout,
  getMobile,
  type CameraWindow,
  type MatchEvent,
  type MatchState,
  type PlayerState,
} from "@gbw/core";
import { advance, drag, IDLE, lift, liftsAsShot, press, type HoldState } from "./hold";
import {
  addPointer,
  classify,
  clearPointers,
  movePointer,
  pullBaseAngle,
  removePointer,
  renderScaleFor,
  screenConstant,
  screenToWorld,
  viewportFor,
  worldToScreen,
  type Point,
  type PointerState,
} from "./viewport";
import {
  INTERPOLATION_MS,
  poseOfFrames,
  unitFrames,
  unitLook,
  type UnitFrame,
  type UnitPose,
} from "./interpolate";
import { ANGLE_RING_RADIUS, RING_RADIUS, RING_START, angleArc, anglePoint, ringColor, ringSweep } from "./aim";
import { armFullscreen } from "../lib/fullscreen";
import { aimPreview } from "./preview";


export interface BattleCallbacks {
  readonly onPull: (power: number, angle: number) => void;
  readonly onRelease: (power: number, angle: number) => void;
  /** `deadzone` is a release too weak to fire; `gesture` is a second finger taking over the camera (`AC4`/`AC5`). */
  readonly onCancel: (reason: "deadzone" | "gesture" | "pointercancel") => void;
  readonly onCamera: (window: CameraWindow) => void;
  /**
   * Where this client's mobile sits on screen, in CSS pixels (`US-MATCH-003` AC11). The pad hangs on this point so it
   * rings the mobile instead of covering it; `null` means the mobile is not on screen and the pad falls back.
   */
  readonly onFocus?: (point: { readonly x: number; readonly y: number } | null) => void;
  /**
   * The item wheel (owner's layout, 2026-11-09): a press **held on this client's own mobile** opens it at that point, and
   * a press anywhere else closes it (`null`). A hold on the field still arms a shot — only a hold on the hull is a loadout.
   */
  readonly onItemHold?: (point: { readonly x: number; readonly y: number } | null) => void;
}

export interface BattleHandle {
  /**
   * Push a new state. `events` are the engine's own events for that step: a `shot` event carries the resolved path, so
   * the shell can be animated from the numbers that decided the damage.
   */
  setState(state: MatchState, localSlot: number, events?: readonly MatchEvent[]): void;
  /**
   * Whether this client may aim right now (`US-MATCH-002` AC7/AC8): the scene refuses to start a pull, draw the ring
   * or hand a release to `onRelease` while it is false. The camera keeps working — panning is not aiming.
   */
  setAimAllowed(allowed: boolean): void;
  /** Which of the three weapons the strip has selected (`US-MATCH-005` AC2). */
  setWeaponSlot(slot: 0 | 1 | 2): void;
  /** The angle the pad has nudged the shot by, so the aim aid matches the shot that will be sent. */
  setAimDelta(delta: number): void;
  /**
   * The trajectory aid (`US-MATCH-005` AC2). Off by default: the genre gives the player an angle number and a power
   * bar, and reading the arc is the skill. The aid is a training wheel, not the game.
   */
  setAimAid(enabled: boolean): void;
  destroy(): void;
}

/** A monotonic clock in milliseconds: `Date.now()` can be corrected backwards and would blend a unit in reverse. */
function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

/** The angle the barrel opens on: the classic artillery 45°, clamped into whatever the mobile can fire. */
const OPEN_ANGLE = 45;

/** How long an impact flash and its scorch mark stay on screen after the shell lands. */
const IMPACT_MS = 420;
const SCORCH_MS = 6_000;

interface FlyingShot {
  readonly path: readonly { readonly x: number; readonly y: number }[];
  readonly startedAt: number;
  readonly flightMs: number;
  readonly impact: { readonly x: number; readonly y: number } | null;
  readonly radius: number;
  readonly hits: readonly { readonly slot: number; readonly amount: number }[];
}

interface Scorch {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly at: number;
}

interface Options {
  readonly parent: HTMLElement;
  readonly state: MatchState;
  readonly localSlot: number;
  readonly callbacks: BattleCallbacks;
}

/** A sky band colour ramp, top to horizon: dusk over a dark map, drawn as bands so no gradient API is needed. */
const SKY: readonly number[] = [0x070d1a, 0x0b1220, 0x101a2e, 0x152238, 0x1a2a44, 0x21324f, 0x283a58, 0x2e405f];

class BattleScene extends Phaser.Scene {
  private state: MatchState;
  private localSlot: number;
  private readonly callbacks: BattleCallbacks;
  private graphics!: Phaser.GameObjects.Graphics;
  private window: CameraWindow;
  /** The pose the current blend starts from and when it started — the near end of the segment (`AC2`). */
  private fromPose: readonly UnitPose[] | null = null;
  private fromAt = 0;
  /** Last point handed to `onFocus`, so the page is only told when the mobile actually moved. */
  private reportedFocus: { readonly x: number; readonly y: number } | null = null;
  /** What the last frame put on screen: the next blend has to start there, or a state that lands mid-segment
   *  would make the units jump forward by however far they had already travelled. */
  private lastDrawn: readonly UnitPose[] | null = null;
  private pointers: PointerState = clearPointers();
  private origin: Point | null = null;
  /** The press that started on this client's own hull: its hold opens the item wheel instead of arming a shot. */
  private holdOnSelf = false;
  /** The wheel is on screen, so the next press elsewhere has to dismiss it. */
  private itemOpen = false;
  /** One finger either pans the camera or arms a shot; `hold.ts` owns which (`US-MATCH-002`). */
  private hold: HoldState = IDLE;
  /**
   * The barrel's angle. A pull rotates it from where the last shot left it (owner's call, 2026-11-08): the mobile does
   * not re-centre between turns, so a player can keep a known angle and only adjust the power.
   */
  private barrelAngle = 45;
  /** The angle the running pull rotates from, latched when it arms (`pullBaseAngle`). */
  private pressAngle: number | null = null;
  /** The first pull of a match starts mid-window so the barrel can go both ways; after that it keeps the last angle. */
  private barrelSeeded = false;

  /**
   * Where the barrel starts. 45° is the angle every artillery game opens on, and on this map it is the one that reaches the
   * opponent at a comfortable pull: measured, the old seed (the middle of the mobile's window — 18° for `mbl-01`) threw the
   * shell 970 units of the 1,640 between the two spawns, so the first shot of every match was a guaranteed miss.
   *
   * A mobile whose window does not contain 45° gets the nearest angle it can actually fire, not a silent clamp to a number
   * outside its own range.
   */
  private openAngle(): number {
    const player = this.state.players.find((candidate) => candidate.slot === this.localSlot);
    if (!player) return this.barrelAngle;
    const mobile = getMobile(player.mobileId);
    return Math.min(Math.max(OPEN_ANGLE, mobile.angleMin), mobile.angleMax);
  }
  private previousSpread: number | null = null;
  private pullPower = 0;
  private pullAngle = 0;
  private aimAllowed = true;
  /** The weapon slot the strip has selected; the preview and the ring use this class (`US-MATCH-005` AC2). */
  private weaponSlot: 0 | 1 | 2 = 0;
  /** The pad's angle nudge, mirrored from the page: the preview must carry the angle the shot will carry. */
  private aimDelta = 0;
  /** Whether the trajectory preview is drawn; off unless the player asks for it (`setAimAid`). */
  private aimAid = false;
  /** Canvas pixels per world unit, recomputed every frame: the HUD parts of the canvas stay screen-sized at any zoom. */
  private screenScale = 1;
  /**
   * Device pixels per CSS pixel (`US-MATCH-011`). The canvas is rasterised at this ratio and styled back down, so the
   * drawing space is device pixels while gestures and screen constants are still measured in CSS pixels.
   */
  private renderScale = 1;
  private pointerHandlers: Array<{ type: string; handler: (event: PointerEvent) => void }> = [];
  /** The one-shot fullscreen request armed on the canvas (`US-MATCH-007` AC1). */
  private disarmFullscreen: () => void = () => undefined;
  /** Shells in the air, keyed by nothing: they are independent and short-lived. */
  private flying: FlyingShot[] = [];
  private scorches: Scorch[] = [];
  /** Muzzle flashes: where and when a shot left. */
  private flashes: { readonly x: number; readonly y: number; readonly at: number }[] = [];
  private shakeUntil = 0;

  constructor(state: MatchState, localSlot: number, callbacks: BattleCallbacks, renderScale = 1) {
    super("battle");
    this.state = state;
    this.localSlot = localSlot;
    this.callbacks = callbacks;
    this.renderScale = Math.max(1, renderScale);
    // A placeholder only: `create()` frames the window on the real canvas, because Phaser has no `scale`
    // until the scene is booted (`this.scale` in the constructor throws).
    this.window = defaultWindow(TUNABLES.viewDefaultWidth / TUNABLES.viewDefaultHeight);
  }

  setAimDelta(delta: number): void {
    if (this.aimDelta === delta) return;
    this.aimDelta = delta;
  }

  setWeaponSlot(slot: 0 | 1 | 2): void {
    if (this.weaponSlot === slot) return;
    this.weaponSlot = slot;
  }

  /** Drops the running gesture's anchor and its latched angle together, so a later move cannot rotate from a stale base. */
  private clearOrigin(): void {
    this.origin = null;
    this.pressAngle = null;
  }

  setAimAid(enabled: boolean): void {
    this.aimAid = enabled;
  }

  setAimAllowed(allowed: boolean): void {
    this.aimAllowed = allowed;
    if (!allowed) {
      // A pull in flight is dropped rather than fired when the right to aim goes away mid-gesture.
      this.clearOrigin();
      this.pullPower = 0;
      this.pullAngle = 0;
      this.callbacks.onCancel("gesture");
    }
  }

  setState(state: MatchState, localSlot: number, events: readonly MatchEvent[] = []): void {
    const previousActiveSlot = this.state.turn.activeSlot;
    // Start the segment where the screen actually is, so a state that lands mid-blend continues from the drawn
    // pixel instead of teleporting the rest of the way (`US-MATCH-001` AC2).
    this.fromPose = this.lastDrawn;
    this.fromAt = now();
    this.state = state;
    this.localSlot = localSlot;
    for (const event of events) this.playEvent(event);
    // A turn change re-frames on the pair; a move re-frames when it takes someone out of the window. Panning by hand
    // still wins until the next turn, which is what `US-MATCH-007` § 5 promises.
    const moved = events.some((event) => event.kind === "move");
    if (state.turn.activeSlot !== previousActiveSlot || moved) this.frameOn(state.turn.activeSlot, state);
  }

  /** Turn the engine's own events into pixels: the shell, the flash, the numbers. */
  private playEvent(event: MatchEvent): void {
    if (event.kind !== "shot") return;
    const startedAt = now();
    const hits = event.hits.map((hit) => ({
      slot: hit.slot,
      amount: Number((hit as { damage?: number; amount?: number }).damage ?? (hit as { amount?: number }).amount ?? 0),
    }));
    this.flying.push({
      path: event.path,
      startedAt,
      // The engine's own flight time, not a 2.6 s squeeze of it: a 4.7 s arc compressed into 2.6 s was a shell the player
      // could not follow, and following it is the whole point of animating from the resolved path.
      flightMs: Math.max(220, Math.min(6_000, event.flightMs || 700)),
      impact: event.impact,
      radius: 70,
      hits,
    });
    const from = event.path[0];
    if (from) this.flashes.push({ x: from.x, y: from.y, at: startedAt });
  }

  /** Tell the page where this client's mobile landed; a 2 px threshold keeps React out of every frame. */
  private emitFocus(frames: readonly UnitFrame[]): void {
    const report = this.callbacks.onFocus;
    if (!report) return;
    // The pad belongs to this client, so it rings the local mobile — the active one on the local player's own turn.
    const active = frames.find((frame) => frame.slot === this.localSlot);
    if (!active) {
      if (this.reportedFocus !== null) {
        this.reportedFocus = null;
        report(null);
      }
      return;
    }
    const point = worldToScreen(
      this.window,
      viewportFor(this.window, this.scale.width, this.scale.height),
      active.x,
      active.y,
    );
    // `worldToScreen` answers in canvas pixels; this point is consumed by the DOM (the item wheel's anchor) and by the
    // hull hit test, which compares it with raw pointer coordinates. Both are CSS pixels (`US-MATCH-011`).
    const css = { x: point.x / this.renderScale, y: point.y / this.renderScale };
    const last = this.reportedFocus;
    if (last && Math.abs(last.x - css.x) < 2 && Math.abs(last.y - css.y) < 2) return;
    const next = { x: css.x, y: css.y };
    this.reportedFocus = next;
    report(next);
  }

  /** Segment progress in [0, 1] once `clampProgress` reads it; `now()` is monotonic for the reason on line 47. */
  private progress(): number {
    return (now() - this.fromAt) / INTERPOLATION_MS;
  }

  /**
   * Frame the turn: the shooter **and** the opponent it is shooting at.
   *
   * Following only the shooter left the target 1,640 units away on a 2,000-unit map — off screen — so the player was
   * aiming at a number with no enemy to aim at. `windowOnBoth` keeps the pair in frame and `clampWindow` keeps the
   * result inside the map.
   */
  private frameOn(slot: number, state: MatchState): void {
    const shooter = state.players.find((candidate) => candidate.slot === slot);
    if (!shooter) return;
    const opponents = state.players.filter((candidate) => candidate.team !== shooter.team && !candidate.eliminated);
    const target = opponents[0] ?? state.players.find((candidate) => candidate.slot !== shooter.slot);
    const aspect = this.scale.width / Math.max(1, this.scale.height);
    const framed = target
      ? windowOnBoth(shooter.x, target.x, aspect, Math.min(shooter.y, target.y))
      : windowOnBoth(shooter.x, shooter.x, aspect, shooter.y);
    // The loadout strip and the power readout hang on the left of the HUD, over the team-A spawn: nudge the frame so
    // this client's own mobile sits clear of them instead of behind them.
    const local = state.players.find((candidate) => candidate.slot === this.localSlot);
    const nudge = local && local.x < framed.x + framed.width / 2 ? -framed.width * 0.07 : framed.width * 0.07;
    this.window = clampWindow({ ...framed, x: framed.x + nudge });
  }

  create(): void {
    this.frameOn(this.state.turn.activeSlot, this.state);
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#070d1a");
    this.attachPointerHandlers();
    // Fullscreen needs a gesture, so it is armed on the canvas rather than requested at mount (`US-MATCH-007` AC1).
    // The fullscreen element has to be the whole match screen, not the canvas: fullscreen renders only the target's
    // subtree, so arming it on the canvas hid the entire HUD — HP bars, the weapon strip, the turn clock and the
    // aim-aid toggle — the moment the player pulled for the first time (found by playing, 2026-11-08).
    this.disarmFullscreen = armFullscreen(
      ((this.game.canvas.closest(".match") as HTMLElement | null) ?? this.game.canvas) as HTMLElement,
    );
    this.events.once("shutdown", () => this.shutdown());
    this.callbacks.onCamera(this.window);
  }

  private attachPointerHandlers(): void {
    const canvas = this.game.canvas;
    canvas.style.touchAction = "none";
    const toPoint = (event: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const down = (event: PointerEvent): void => {
      canvas.setPointerCapture?.(event.pointerId);
      this.pointers = addPointer(this.pointers, toPoint(event));
      if (this.pointers.pointers.length === 1) {
        // A press is ambiguous: it may become a pan, a shot, or — on the player's own hull — the item wheel. `hold.ts`
        // decides, and `origin` stays null until the hold fires, so a drag that never arms cannot fire on release
        // (`US-MATCH-002` AC7/AC8).
        const pressPoint = toPoint(event);
        const onSelf = this.aimAllowed && this.onOwnHull(pressPoint);
        this.holdOnSelf = onSelf;
        // A press anywhere but the hull dismisses the wheel; the hull itself re-opens it after the hold.
        if (this.itemOpen && !onSelf) {
          this.itemOpen = false;
          this.callbacks.onItemHold?.(null);
        }
        this.hold = press(pressPoint, now());
        this.clearOrigin();
        this.pullPower = 0;
        this.pullAngle = 0;
      } else {
        // A second finger cancels the shot, by design: aiming is a one-finger, one-thought act and a stray thumb must
        // not silently change the angle of a shot already being measured (product decision, 2026-11-08).
        this.previousSpread = this.spread();
        this.clearOrigin();
        this.hold = lift();
        this.callbacks.onCancel("gesture");
      }
    };
    const move = (event: PointerEvent): void => {
      const point = toPoint(event);
      if (!this.pointers.pointers.some((candidate) => candidate.id === point.id)) return;
      this.pointers = movePointer(this.pointers, point);
      const stepped = drag(this.hold, point);
      this.hold = stepped.state;
      if (stepped.pan) {
        // One finger drags the world: the camera follows the hand and stays where it is put until the player moves it.
        this.window = panBy(this.window, stepped.pan.dx, stepped.pan.dy, this.cssWidth());
        this.callbacks.onCamera(this.window);
        return;
      }
      this.interpret(point);
    };
    const up = (event: PointerEvent): void => {
      const point = toPoint(event);
      const wasSingle = this.pointers.pointers.length === 1;
      this.pointers = removePointer(this.pointers, point.id);
      if (wasSingle && this.origin && liftsAsShot(this.hold)) {
        const gesture = classify(this.pointers, {
          origin: this.origin,
          facing: this.facing(),
          fullPowerDistance: this.fullPowerDistance(),
          baseAngle: pullBaseAngle(this.pressAngle, this.barrelAngle),
          previousSpread: null,
        });
        const power = gesture.kind === "pull" ? gesture.power : this.pullPower;
        const angle = gesture.kind === "pull" ? gesture.angle : this.pullAngle;
        if (power >= TUNABLES.powerDeadzone) this.callbacks.onRelease(power, angle);
        else this.callbacks.onCancel(event.type === "pointercancel" ? "pointercancel" : "deadzone");
      }
      // The pull is spent: clear the ring and the predicted arc until the next gesture starts.
      this.pullPower = 0;
      this.pullAngle = 0;
      this.clearOrigin();
      this.hold = lift();
      this.holdOnSelf = false;
      this.previousSpread = null;
      if (this.pointers.pointers.length === 0) this.pointers = clearPointers();
    };
    const handlers: Array<{ type: string; handler: (event: PointerEvent) => void }> = [
      { type: "pointerdown", handler: down },
      { type: "pointermove", handler: move },
      { type: "pointerup", handler: up },
      { type: "pointercancel", handler: up },
    ];
    for (const { type, handler } of handlers) {
      const listener = handler as EventListener;
      canvas.addEventListener(type, listener);
      this.pointerHandlers.push({ type, handler });
    }
  }

  /**
   * The edge `powerFromDrag` measures against. It multiplies by `TUNABLES.powerDragFullRatio` (0.45) itself, so passing
   * the **width** puts full power at 380 px on an 844 px screen — a throw the thumb can hold a number inside, instead of
   * the 175 px flick the shorter edge gave.
   */
  private fullPowerDistance(): number {
    return this.cssWidth();
  }

  /**
   * The battlefield's width in CSS pixels. `this.scale.width` is the canvas backing store, which is `renderScale` times
   * the CSS width, so every gesture constant and every pan has to come back through here (`US-MATCH-011`).
   */
  private cssWidth(): number {
    return this.scale.width / this.renderScale;
  }

  /** Re-asked on resize: a window dragged to another display can change its ratio. */
  setRenderScale(renderScale: number): void {
    this.renderScale = Math.max(1, renderScale);
  }

  /**
   * Is this press on this client's own mobile? The hull is 26 px wide on screen at the framing the match uses; the hit
   * radius is generous (34 px) because the hold is a deliberate act and a miss costs the player their aim.
   */
  private onOwnHull(point: Point): boolean {
    const at = this.reportedFocus;
    if (!at) return false;
    return Math.hypot(point.x - at.x, point.y - at.y) <= 34;
  }

  private spread(): number {
    const [a, b] = this.pointers.pointers;
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  }

  private facing(): 1 | -1 {
    const player = this.state.players.find((candidate) => candidate.slot === this.localSlot);
    return player?.facing ?? 1;
  }

  private interpret(_point: Point): void {
    const gesture = classify(this.pointers, {
      origin: this.origin,
      facing: this.facing(),
      fullPowerDistance: this.fullPowerDistance(),
      baseAngle: pullBaseAngle(this.pressAngle, this.barrelAngle),
      previousSpread: this.previousSpread,
    });
    if (gesture.kind === "pull") {
      this.pullPower = gesture.power;
      this.pullAngle = gesture.angle;
      this.barrelAngle = gesture.angle;
      this.callbacks.onPull(gesture.power, gesture.angle);
      return;
    }
    if (gesture.kind === "pan") {
      // Two fingers pan the window; the camera then stays where the player put it until the next turn.
      this.window = panBy(this.window, gesture.dx, gesture.dy, this.cssWidth());
      this.callbacks.onCamera(this.window);
      return;
    }
    if (gesture.kind === "zoom") {
      const center = screenToWorld(
        this.window,
        viewportFor(this.window, this.scale.width, this.scale.height),
        this.scale.width / 2,
        this.scale.height / 2,
      );
      this.window = pinchTo(this.window, gesture.scale, center.x, center.y);
      this.previousSpread = this.spread();
      this.callbacks.onCamera(this.window);
    }
  }

  override update(): void {
    // The hold timer lives here because only the frame loop knows time passed without a move.
    const armed = advance(this.hold, now());
    if (armed.phase === "pulling" && this.hold.phase === "pending") {
      if (this.holdOnSelf) {
        // A held press on the player's own hull is a loadout, not a shot: open the wheel where the mobile stands and spend
        // the hold, so the release that follows cannot fire (`owner`, 2026-11-09).
        this.holdOnSelf = false;
        this.itemOpen = true;
        this.hold = lift();
        this.clearOrigin();
        const at = this.reportedFocus;
        this.callbacks.onItemHold?.(at ? { x: at.x, y: at.y } : null);
        return;
      }
      this.hold = armed;
      // Only a player who may shoot gets a ring; everyone else keeps panning (`AC7`).
      this.origin = this.aimAllowed && armed.origin ? { id: 0, x: armed.origin.x, y: armed.origin.y } : null;
      if (this.origin && !this.barrelSeeded) {
        this.barrelAngle = this.openAngle();
        this.barrelSeeded = true;
      }
      // Latch after the seed: the first pull of a match rotates from the angle the barrel opened on.
      this.pressAngle = this.origin ? this.barrelAngle : null;
    } else if (armed !== this.hold) {
      this.hold = armed;
    }
    const graphics = this.graphics;
    graphics.clear();
    const width = this.scale.width;
    const scale = width / this.window.width;
    this.screenScale = scale;
    this.cameras.main.setZoom(scale);
    this.cameras.main.centerOn(this.window.x + this.window.width / 2, this.window.y + this.window.height / 2);
    // A landed shell nudges the frame; it never moves the window itself, so the ruler stays honest.
    const time = now();
    if (time < this.shakeUntil) {
      const left = (this.shakeUntil - time) / IMPACT_MS;
      this.cameras.main.setScroll(
        this.cameras.main.scrollX + Math.sin(time / 18) * 6 * left,
        this.cameras.main.scrollY + Math.cos(time / 14) * 4 * left,
      );
    }

    this.drawSky(graphics);
    this.drawTerrain(graphics);
    this.drawScorches(graphics, time);
    this.drawRuler(graphics);

    const frames = unitFrames(this.fromPose, this.state, this.progress());
    this.lastDrawn = poseOfFrames(frames);
    // `unitFrames` answers one frame per player in roster order, so no lookup per frame is needed.
    this.state.players.forEach((player, index) => {
      const frame = frames[index];
      if (frame) this.drawPlayer(graphics, player, frame);
    });
    this.drawAim(graphics, frames);
    this.drawFlashes(graphics, time);
    this.drawShells(graphics, time);
    this.emitFocus(frames);
  }

  /** Dusk sky, drawn as bands: no gradient API to depend on, and the horizon stays where the terrain meets it. */
  private drawSky(graphics: Phaser.GameObjects.Graphics): void {
    const { x, y, width, height } = this.window;
    const bandHeight = height / SKY.length;
    SKY.forEach((colour, index) => {
      graphics.fillStyle(colour, 1);
      graphics.fillRect(x, y + index * bandHeight, width, bandHeight + 1);
    });
    // A low sun glow on the horizon, so the sky is not a flat ramp.
    graphics.fillStyle(0x3a4a6b, 0.35);
    graphics.fillEllipse(x + width * 0.62, y + height * 0.86, width * 0.55, height * 0.22);
    graphics.fillStyle(0x5a6f96, 0.18);
    graphics.fillEllipse(x + width * 0.62, y + height * 0.86, width * 0.3, height * 0.12);
  }

  /** Terrain from the height field, with a lit surface band so the ground reads as ground. */
  private drawTerrain(graphics: Phaser.GameObjects.Graphics): void {
    const step = this.state.terrainStep;
    const heights = this.state.terrain;
    const surface = (): void => {
      graphics.beginPath();
      graphics.moveTo(0, TUNABLES.mapHeight);
      for (let index = 0; index < heights.length; index += 1) {
        graphics.lineTo(index * step, heights[index] ?? TUNABLES.mapHeight);
      }
      graphics.lineTo(TUNABLES.mapWidth, TUNABLES.mapHeight);
      graphics.closePath();
    };
    graphics.fillStyle(0x2b1f14, 1);
    surface();
    graphics.fillPath();
    // Three lighter bands just under the surface line: cheap depth without a texture.
    const bands: readonly [number, number, number][] = [
      [14, 0x6b4f2f, 0.55],
      [34, 0x4a3620, 0.5],
      [70, 0x38281a, 0.4],
    ];
    for (const [offset, colour, alpha] of bands) {
      graphics.lineStyle(offset, colour, alpha);
      graphics.beginPath();
      for (let index = 0; index < heights.length; index += 1) {
        const px = index * step;
        const py = (heights[index] ?? TUNABLES.mapHeight) + offset / 2;
        if (index === 0) graphics.moveTo(px, py);
        else graphics.lineTo(px, py);
      }
      graphics.strokePath();
    }
    graphics.lineStyle(3, 0x9a7442, 0.95);
    graphics.beginPath();
    for (let index = 0; index < heights.length; index += 1) {
      const px = index * step;
      const py = heights[index] ?? TUNABLES.mapHeight;
      if (index === 0) graphics.moveTo(px, py);
      else graphics.lineTo(px, py);
    }
    graphics.strokePath();
  }

  private drawRuler(graphics: Phaser.GameObjects.Graphics): void {
    const ruler = rulerLayout(this.window);
    graphics.lineStyle(1, 0x6b7a90, 0.6);
    for (let index = 0; index <= ruler.segments; index += 1) {
      const tickX = this.window.x + index * ruler.unitsPerDivision;
      const tickHeight = index % 2 === 0 ? 14 : 7;
      graphics.lineBetween(tickX, this.window.y + this.window.height - tickHeight, tickX, this.window.y + this.window.height);
    }
  }

  private drawScorches(graphics: Phaser.GameObjects.Graphics, time: number): void {
    this.scorches = this.scorches.filter((scorch) => time - scorch.at < SCORCH_MS);
    for (const scorch of this.scorches) {
      const age = (time - scorch.at) / SCORCH_MS;
      graphics.fillStyle(0x120b06, 0.5 * (1 - age));
      graphics.fillEllipse(scorch.x, scorch.y, scorch.radius * 1.6, scorch.radius * 0.5);
    }
  }

  private drawFlashes(graphics: Phaser.GameObjects.Graphics, time: number): void {
    this.flashes = this.flashes.filter((flash) => time - flash.at < 160);
    for (const flash of this.flashes) {
      const age = (time - flash.at) / 160;
      graphics.fillStyle(0xffd27a, 0.9 * (1 - age));
      graphics.fillCircle(flash.x, flash.y, 10 + age * 18);
      graphics.fillStyle(0xffffff, 0.6 * (1 - age));
      graphics.fillCircle(flash.x, flash.y, 5 + age * 8);
    }
  }

  /**
   * The shell, along the engine's own path, then the impact: a flash, a shock ring, the scorch and the numbers.
   *
   * This is the whole reason the shot is animated from the event rather than from a guess — `path` and `flightMs` come
   * out of `resolveShot`, so what the player watches is what the resolver did.
   */
  private drawShells(graphics: Phaser.GameObjects.Graphics, time: number): void {
    const landed: FlyingShot[] = [];
    for (const shot of this.flying) {
      const progress = (time - shot.startedAt) / shot.flightMs;
      if (progress < 1) {
        const last = shot.path.length - 1;
        const at = Math.max(0, Math.min(last, Math.floor(progress * last)));
        const point = shot.path[at];
        if (point) {
          // A trail behind the shell, so a fast shot still reads as motion — and a shell big enough to find on a
          // 2,000-unit map: 5 px at the far end of the field was a speck (`owner`, 2026-11-09).
          for (let back = 1; back <= 6; back += 1) {
            const previous = shot.path[Math.max(0, at - back * 3)];
            if (!previous) continue;
            graphics.fillStyle(0xffc46b, 0.4 / back);
            graphics.fillCircle(previous.x, previous.y, 7 - back * 0.8);
          }
          graphics.fillStyle(0xffe0a3, 1);
          graphics.fillCircle(point.x, point.y, 7);
          graphics.fillStyle(0xffffff, 0.9);
          graphics.fillCircle(point.x, point.y, 3.2);
        }
        continue;
      }
      const since = time - shot.startedAt - shot.flightMs;
      if (since > IMPACT_MS) {
        landed.push(shot);
        continue;
      }
      const burst = since / IMPACT_MS;
      if (shot.impact) {
        graphics.fillStyle(0xffb347, 0.8 * (1 - burst));
        graphics.fillCircle(shot.impact.x, shot.impact.y, shot.radius * (0.5 + burst));
        graphics.fillStyle(0xfff1c2, 0.9 * (1 - burst));
        graphics.fillCircle(shot.impact.x, shot.impact.y, shot.radius * 0.35 * (1 - burst));
        graphics.lineStyle(3, 0xffffff, 0.5 * (1 - burst));
        graphics.strokeCircle(shot.impact.x, shot.impact.y, shot.radius * (0.8 + burst * 1.8));
        // Smoke: three puffs that rise and fade.
        for (let puff = 0; puff < 3; puff += 1) {
          graphics.fillStyle(0x8a8f99, 0.25 * (1 - burst));
          graphics.fillCircle(
            shot.impact.x + (puff - 1) * 22,
            shot.impact.y - 18 - burst * (24 + puff * 12),
            10 + burst * 12,
          );
        }
      }
    }
    for (const shot of landed) {
      this.flying = this.flying.filter((candidate) => candidate !== shot);
      if (!shot.impact) continue;
      this.scorches.push({ x: shot.impact.x, y: shot.impact.y, radius: shot.radius, at: time });
      this.shakeUntil = Math.max(this.shakeUntil, time + IMPACT_MS);
      this.spawnNumbers(shot);
    }
  }

  /** Damage numbers, as text objects in world space scaled back to a constant screen size. */
  private spawnNumbers(shot: FlyingShot): void {
    if (!shot.impact) return;
    shot.hits.forEach((hit, index) => {
      if (hit.amount <= 0) return;
      const label = this.add
        .text(shot.impact!.x + (index - 0.5) * 34, shot.impact!.y - 46, `-${Math.round(hit.amount)}`, {
          fontFamily: "system-ui, sans-serif",
          // The glyphs are rasterised once, so they have to be rasterised at device resolution (`US-MATCH-011`).
          fontSize: `${Math.round(18 * this.renderScale)}px`,
          color: "#ffd9a0",
          stroke: "#1b0f06",
          strokeThickness: 4 * this.renderScale,
        })
        .setOrigin(0.5)
        .setScale(1 / Math.max(0.2, this.screenScale));
      this.tweens.add({
        targets: label,
        y: label.y - 46,
        alpha: 0,
        duration: 900,
        ease: "Quad.easeOut",
        onComplete: () => label.destroy(),
      });
    });
  }

  /**
   * A vector mobile: treads, hull in the team colour, a turret whose barrel follows the aim, a health bar
   * with the shield ring around it, and a name plate. Placeholder art — `US-CORE-007` swaps in sprites.
   */
  private drawPlayer(graphics: Phaser.GameObjects.Graphics, player: PlayerState, frame: UnitFrame): void {
    const mobile = getMobile(player.mobileId);
    const halfWidth = 26;
    const hullHeight = 16;
    const groundY = frame.y;
    const look = unitLook(frame);

    if (frame.eliminated) {
      // A wreck fades but keeps its place and its facing: nothing about a dead mobile may look alive (`AC6`).
      graphics.lineStyle(3, 0x6b3f3f, look.alpha);
      graphics.lineBetween(frame.x - halfWidth, groundY - 6, frame.x + halfWidth, groundY - 26);
      graphics.lineBetween(frame.x + halfWidth, groundY - 6, frame.x - halfWidth, groundY - 26);
      return;
    }

    const accent = player.team === "A" ? 0x4f9dff : 0xff7043;
    const active = player.slot === this.state.turn.activeSlot;

    // Drop shadow and treads.
    graphics.fillStyle(0x000000, 0.28);
    graphics.fillEllipse(frame.x, groundY - 1, halfWidth * 2.4, 9);
    graphics.fillStyle(0x1b2531, 1);
    graphics.fillRoundedRect(frame.x - halfWidth - 4, groundY - 12, (halfWidth + 4) * 2, 12, 5);
    graphics.lineStyle(1, 0x33465c, 0.9);
    for (let tick = -halfWidth; tick <= halfWidth; tick += 8) {
      graphics.lineBetween(frame.x + tick, groundY - 11, frame.x + tick, groundY - 2);
    }

    // Hull with a lighter top deck, then the turret and barrel.
    graphics.fillStyle(accent, 1);
    graphics.fillRoundedRect(frame.x - halfWidth, groundY - 12 - hullHeight, halfWidth * 2, hullHeight, 5);
    graphics.fillStyle(0xffffff, 0.18);
    graphics.fillRoundedRect(frame.x - halfWidth + 3, groundY - 11 - hullHeight, halfWidth * 2 - 6, 5, 3);

    const turretY = groundY - 12 - hullHeight - 2;
    const aim = ((this.pullAngleFor(player) * Math.PI) / 180) * -1;
    const barrel = 30;
    graphics.lineStyle(7, 0x16202b, 1);
    graphics.lineBetween(
      frame.x,
      turretY,
      frame.x + Math.cos(aim) * barrel * frame.facing,
      turretY + Math.sin(aim) * barrel,
    );
    graphics.lineStyle(3, accent, 1);
    graphics.lineBetween(
      frame.x,
      turretY,
      frame.x + Math.cos(aim) * (barrel - 4) * frame.facing,
      turretY + Math.sin(aim) * (barrel - 4),
    );
    graphics.fillStyle(0x16202b, 1);
    graphics.fillCircle(frame.x, turretY, 8);
    graphics.fillStyle(accent, 1);
    graphics.fillCircle(frame.x, turretY, 5);

    // Health bar, shield arc and the active-player ring.
    const ratio = Math.max(0, Math.min(1, frame.hp / Math.max(1, mobile.maxHp)));
    const barY = turretY - 22;
    graphics.fillStyle(0x0b1220, 0.9);
    graphics.fillRoundedRect(frame.x - 26, barY, 52, 7, 3);
    graphics.fillStyle(ratio > 0.5 ? 0x5cd67a : ratio > 0.25 ? 0xf2c14e : 0xe5544b, 1);
    graphics.fillRoundedRect(frame.x - 26, barY, 52 * ratio, 7, 3);
    if (ratio < 1) {
      graphics.lineStyle(1, 0xffffff, 0.25);
      graphics.strokeRoundedRect(frame.x - 26, barY, 52, 7, 3);
    }
    if (player.shield > 0) {
      const shieldRatio = Math.max(0, Math.min(1, player.shield / Math.max(1, mobile.maxShield)));
      graphics.lineStyle(3, 0x7fd6ff, 0.85);
      graphics.beginPath();
      graphics.arc(frame.x, turretY, 30, Math.PI, Math.PI + Math.PI * shieldRatio, false);
      graphics.strokePath();
    }
    if (active) {
      graphics.lineStyle(2, 0xffffff, 0.8);
      graphics.strokeCircle(frame.x, turretY, 34);
      graphics.fillStyle(0xffffff, 0.9);
      graphics.fillTriangle(
        frame.x - 6,
        turretY - 46,
        frame.x + 6,
        turretY - 46,
        frame.x,
        turretY - 38,
      );
    }
    graphics.lineStyle(1, 0xffffff, 0.12);
    graphics.lineBetween(frame.x - halfWidth, groundY, frame.x + halfWidth, groundY);
  }

  private pullAngleFor(player: PlayerState): number {
    if (player.slot !== this.localSlot || this.origin === null) return 45;
    return this.pullAngle;
  }

  private drawAim(graphics: Phaser.GameObjects.Graphics, frames: readonly UnitFrame[]): void {
    const frame = frames.find((candidate) => candidate.slot === this.localSlot);
    const player = this.state.players.find((candidate) => candidate.slot === this.localSlot);
    if (!frame || !player || frame.eliminated) return;
    // The ring and the preview only exist while this client may actually shoot (`US-MATCH-002` AC7).
    if (!this.aimAllowed) return;

    // The mobile's own firing window, drawn before the pull ring so it reads as the ground the ring sits on: a dim fan from
    // `angleMin` to `angleMax` with the current angle lit (owner's request, 2026-11-09). It is on screen whenever this client
    // may shoot, not only mid-pull, so the player can see the sweep and where the barrel sits inside it.
    const mobile = getMobile(player.mobileId);
    const px = (value: number): number => screenConstant(value * this.renderScale, this.screenScale);
    const pivotY = frame.y - px(10);
    const window = angleArc(mobile.angleMin, mobile.angleMax, player.facing);
    graphics.lineStyle(px(4), 0x2b3a58, 0.85);
    graphics.beginPath();
    graphics.arc(frame.x, pivotY, px(ANGLE_RING_RADIUS), window.start, window.end, window.anticlockwise);
    graphics.strokePath();
    // The current angle: a brighter needle over the window, and a dot where it leaves the arc.
    const needle = anglePoint(Math.min(Math.max(this.barrelAngle, mobile.angleMin), mobile.angleMax), player.facing);
    const tipX = frame.x + Math.cos(needle) * px(ANGLE_RING_RADIUS);
    const tipY = pivotY + Math.sin(needle) * px(ANGLE_RING_RADIUS);
    graphics.lineStyle(px(3), 0x4f9dff, 0.95);
    graphics.beginPath();
    graphics.moveTo(frame.x + Math.cos(needle) * px(ANGLE_RING_RADIUS - 12), pivotY + Math.sin(needle) * px(ANGLE_RING_RADIUS - 12));
    graphics.lineTo(tipX, tipY);
    graphics.strokePath();
    graphics.fillStyle(0x4f9dff, 1);
    graphics.fillCircle(tipX, tipY, px(3));

    if (this.pullPower > 0) {
      // A gradient arc around the mobile, clockwise from −90°, that fills with the pull (`US-MATCH-002` AC2).
      // Everything the player aims with keeps its screen size at any zoom (`US-MATCH-007` AC6): the scene draws in
      // world units, so each CSS-pixel length is divided by the canvas scale.
      const centerY = pivotY;
      graphics.lineStyle(px(6), 0x2b3a58, 0.8);
      graphics.strokeCircle(frame.x, centerY, px(RING_RADIUS));
      graphics.lineStyle(px(6), ringColor(this.pullPower), 0.95);
      graphics.beginPath();
      graphics.arc(frame.x, centerY, px(RING_RADIUS), RING_START, RING_START + ringSweep(this.pullPower), false);
      graphics.strokePath();
      graphics.lineStyle(px(2), ringColor(this.pullPower), 0.45);
      graphics.strokeCircle(frame.x, centerY, px(RING_RADIUS + 8));
      // The resolver's own flight, sampled: the same code that will resolve the shot, so it cannot promise a
      // landing the engine will not honour (`US-MATCH-005` AC2). Only drawn when the player turned the aid on — the
      // ring alone is the genre's feedback.
      const preview = this.aimAid ? aimPreview({
        state: this.state,
        localSlot: this.localSlot,
        weaponSlot: this.weaponSlot,
        angle: this.pullAngle,
        power: this.pullPower,
        aimDelta: this.aimDelta,
      }) : null;
      if (preview) {
        // The arc has to be readable at a glance on a night map: a thin line under brighter, larger dots. 2 px at
        // 40 % was invisible in a real screenshot (2026-11-08), which made the aid look broken next to the ring.
        graphics.lineStyle(px(1.5), 0xffffff, 0.35);
        graphics.beginPath();
        graphics.moveTo(preview.path[0]?.x ?? 0, preview.path[0]?.y ?? 0);
        for (const dot of preview.path.slice(1)) graphics.lineTo(dot.x, dot.y);
        graphics.strokePath();
        graphics.fillStyle(0xffffff, 0.9);
        for (const dot of preview.path) graphics.fillCircle(dot.x, dot.y, px(2.5));
        // No impact means the shot leaves the map: a blast ring in the sky would be a promise nobody keeps.
        if (preview.impact) {
          graphics.lineStyle(px(2), 0xffffff, 0.55);
          // The blast radius is a world length (it is what the engine carves), so only its stroke stays screen-sized.
          graphics.strokeCircle(preview.impact.x, preview.impact.y, preview.radius);
        }
      }
    }
  }

  shutdown(): void {
    this.disarmFullscreen();
    const canvas = this.game.canvas;
    for (const { type, handler } of this.pointerHandlers) canvas.removeEventListener(type, handler as EventListener);
    this.pointerHandlers = [];
  }
}

/** Mount the battlefield inside a container. Returns a handle the page uses to push state and clean up. */
export function mountBattle(options: Options): BattleHandle {
  const render = renderScaleFor(typeof window === "undefined" ? 1 : window.devicePixelRatio);
  const scene = new BattleScene(options.state, options.localSlot, options.callbacks, render);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    // The game size is the **device-pixel** size and `zoom` styles the canvas back down to its parent (`US-MATCH-011`).
    // `Scale.RESIZE` cannot be used for this: it forces the backing store to the parent's CSS size, which is why a
    // 2.6-ratio phone was rasterising the battlefield at one device pixel per CSS pixel and the compositor stretched it.
    width: Math.round(Math.max(1, options.parent.clientWidth) * render),
    height: Math.round(Math.max(1, options.parent.clientHeight) * render),
    backgroundColor: "#070d1a",
    scene,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / render, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    render: { antialias: true },
  });
  const resize = (): void => {
    const ratio = renderScaleFor(typeof window === "undefined" ? 1 : window.devicePixelRatio);
    scene.setRenderScale(ratio);
    game.scale.setZoom(1 / ratio);
    game.scale.resize(
      Math.round(Math.max(1, options.parent.clientWidth) * ratio),
      Math.round(Math.max(1, options.parent.clientHeight) * ratio),
    );
  };
  window.addEventListener("resize", resize);
  return {
    setState: (state, localSlot, events) => scene.setState(state, localSlot, events),
    setAimAllowed: (allowed) => scene.setAimAllowed(allowed),
    setWeaponSlot: (slot) => scene.setWeaponSlot(slot),
    setAimDelta: (delta) => scene.setAimDelta(delta),
    setAimAid: (enabled) => scene.setAimAid(enabled),
    destroy: () => {
      window.removeEventListener("resize", resize);
      game.destroy(true);
    },
  };
}