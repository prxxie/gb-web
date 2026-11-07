/**
 * The battlefield renderer (`US-MATCH-001`).
 *
 * Phaser owns pixels and nothing else: state arrives from the host (or the local engine in a bot
 * match), and this scene draws whatever it is given. No rule lives here, so a re-render can never
 * change the outcome (`NFR-22`, `ADR-0004`).
 */
import Phaser from "phaser";
import {
  TUNABLES,
  defaultWindow,
  windowOn,
  panBy,
  pinchTo,
  rulerLayout,
  getMobile,
  type CameraWindow,
  type MatchState,
  type PlayerState,
} from "@gbw/core";
import { addPointer, classify, clearPointers, movePointer, removePointer, screenConstant, screenToWorld, viewportFor, worldToScreen, type Point, type PointerState } from "./viewport";
import {
  INTERPOLATION_MS,
  poseOfFrames,
  unitFrames,
  unitLook,
  type UnitFrame,
  type UnitPose,
} from "./interpolate";
import { RING_RADIUS, RING_START, ringColor, ringSweep } from "./aim";
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
}

export interface BattleHandle {
  setState(state: MatchState, localSlot: number): void;
  /**
   * Whether this client may aim right now (`US-MATCH-002` AC7/AC8): the scene refuses to start a pull, draw the ring
   * or hand a release to `onRelease` while it is false. The camera keeps working — panning is not aiming.
   */
  setAimAllowed(allowed: boolean): void;
  /** Which of the three weapons the strip has selected (`US-MATCH-005` AC2). */
  setWeaponSlot(slot: 0 | 1 | 2): void;
  /** The angle the pad has nudged the shot by, so the aim aid matches the shot that will be sent. */
  setAimDelta(delta: number): void;
  destroy(): void;
}

/** A monotonic clock in milliseconds: `Date.now()` can be corrected backwards and would blend a unit in reverse. */
function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

interface Options {
  readonly parent: HTMLElement;
  readonly state: MatchState;
  readonly localSlot: number;
  readonly callbacks: BattleCallbacks;
}

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
  private previousSpread: number | null = null;
  private pullPower = 0;
  private pullAngle = 0;
  private aimAllowed = true;
  /** The weapon slot the strip has selected; the preview and the ring use this class (`US-MATCH-005` AC2). */
  private weaponSlot: 0 | 1 | 2 = 0;
  /** The pad's angle nudge, mirrored from the page: the preview must carry the angle the shot will carry. */
  private aimDelta = 0;
  /** World units per CSS pixel, recomputed every frame: the HUD parts of the canvas stay screen-sized at any zoom. */
  private screenScale = 1;
  private pointerHandlers: Array<{ type: string; handler: (event: PointerEvent) => void }> = [];
  /** The one-shot fullscreen request armed on the canvas (`US-MATCH-007` AC1). */
  private disarmFullscreen: () => void = () => undefined;


  constructor(state: MatchState, localSlot: number, callbacks: BattleCallbacks) {
    super("battle");
    this.state = state;
    this.localSlot = localSlot;
    this.callbacks = callbacks;
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

  setAimAllowed(allowed: boolean): void {
    this.aimAllowed = allowed;
    if (!allowed) {
      // A pull in flight is dropped rather than fired when the right to aim goes away mid-gesture.
      this.origin = null;
      this.pullPower = 0;
      this.pullAngle = 0;
      this.callbacks.onCancel("gesture");
    }
  }

  setState(state: MatchState, localSlot: number): void {
    const previousActiveSlot = this.state.turn.activeSlot;
    // Start the segment where the screen actually is, so a state that lands mid-blend continues from the drawn
    // pixel instead of teleporting the rest of the way (`US-MATCH-001` AC2).
    this.fromPose = this.lastDrawn;
    this.fromAt = now();
    this.state = state;
    this.localSlot = localSlot;
    // The camera follows whoever is shooting until the player pans; a shot that never leaves the screen
    // does not exist, so the view settles on the active mobile at the start of each turn.
    if (state.turn.activeSlot !== previousActiveSlot) this.frameOn(state.turn.activeSlot, state);
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
    const last = this.reportedFocus;
    if (last && Math.abs(last.x - point.x) < 2 && Math.abs(last.y - point.y) < 2) return;
    const next = { x: point.x, y: point.y };
    this.reportedFocus = next;
    report(next);
  }

  /** Segment progress in [0, 1] once `clampProgress` reads it; `now()` is monotonic for the reason on line 47. */
  private progress(): number {
    return (now() - this.fromAt) / INTERPOLATION_MS;
  }

  /** Centre horizontally on the active mobile and keep the ground line anchored. */
  private frameOn(slot: number, state: MatchState): void {
    const player = state.players.find((candidate) => candidate.slot === slot);
    if (!player) return;
    this.window = windowOn(player.x, this.scale.width / Math.max(1, this.scale.height), player.y);
  }

  create(): void {
    this.frameOn(this.state.turn.activeSlot, this.state);
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#0b1220");
    this.attachPointerHandlers();
    // Fullscreen needs a gesture, so it is armed on the canvas rather than requested at mount (`US-MATCH-007` AC1).
    this.disarmFullscreen = armFullscreen(this.game.canvas);
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
        // Not this client's turn (or it already fired in it): the finger never becomes a pull, so no ring is drawn and
        // `up` finds no origin to release (`US-MATCH-002` AC7/AC8).
        this.origin = this.aimAllowed ? toPoint(event) : null;
        this.pullPower = 0;
        this.pullAngle = 0;
      } else {
        this.previousSpread = this.spread();
        this.origin = null;
        this.callbacks.onCancel("gesture");
      }
    };
    const move = (event: PointerEvent): void => {
      const point = toPoint(event);
      if (!this.pointers.pointers.some((candidate) => candidate.id === point.id)) return;
      this.pointers = movePointer(this.pointers, point);
      this.interpret(point);
    };
    const up = (event: PointerEvent): void => {
      const point = toPoint(event);
      const wasSingle = this.pointers.pointers.length === 1;
      this.pointers = removePointer(this.pointers, point.id);
      if (wasSingle && this.origin) {
        const gesture = classify(this.pointers, {
          origin: this.origin,
          facing: this.facing(),
          screenShorterEdge: Math.min(this.scale.width, this.scale.height),
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
      this.origin = null;
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
      screenShorterEdge: Math.min(this.scale.width, this.scale.height),
      previousSpread: this.previousSpread,
    });
    if (gesture.kind === "pull") {
      this.pullPower = gesture.power;
      this.pullAngle = gesture.angle;
      this.callbacks.onPull(gesture.power, gesture.angle);
      return;
    }
    if (gesture.kind === "pan") {
      // Two fingers pan the window; the camera then stays where the player put it until the next turn.
      this.window = panBy(this.window, gesture.dx, gesture.dy, this.scale.width);
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
    const graphics = this.graphics;
    graphics.clear();
    const width = this.scale.width;
    const height = this.scale.height;
    const scale = width / this.window.width;
    this.screenScale = scale;
    this.cameras.main.setZoom(scale);
    this.cameras.main.centerOn(this.window.x + this.window.width / 2, this.window.y + this.window.height / 2);

    // Sky and sea-level band.
    graphics.fillStyle(0x12203a, 1);
    graphics.fillRect(this.window.x, this.window.y, this.window.width, this.window.height);

    // Terrain: one polygon from the height field.
    const step = this.state.terrainStep;
    const heights = this.state.terrain;
    graphics.fillStyle(0x3f2d1d, 1);
    graphics.beginPath();
    graphics.moveTo(0, TUNABLES.mapHeight);
    for (let index = 0; index < heights.length; index += 1) {
      graphics.lineTo(index * step, heights[index] ?? TUNABLES.mapHeight);
    }
    graphics.lineTo(TUNABLES.mapWidth, TUNABLES.mapHeight);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(2, 0x8f6a3c, 1);
    graphics.strokePath();

    // Ruler ticks along the bottom edge of the visible window.
    const ruler = rulerLayout(this.window);
    graphics.lineStyle(1, 0x6b7a90, 0.6);
    for (let index = 0; index <= ruler.segments; index += 1) {
      const tickX = this.window.x + index * ruler.unitsPerDivision;
      const tickHeight = index % 2 === 0 ? 14 : 7;
      graphics.lineBetween(tickX, this.window.y + this.window.height - tickHeight, tickX, this.window.y + this.window.height);
    }

    const frames = unitFrames(this.fromPose, this.state, this.progress());
    this.lastDrawn = poseOfFrames(frames);
    // `unitFrames` answers one frame per player in roster order, so no lookup per frame is needed.
    this.state.players.forEach((player, index) => {
      const frame = frames[index];
      if (frame) this.drawPlayer(graphics, player, frame);
    });
    this.drawAim(graphics, frames);
    this.emitFocus(frames);
    void height;
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

    if (this.pullPower > 0) {
      // A gradient arc around the mobile, clockwise from −90°, that fills with the pull (`US-MATCH-002` AC2).
      // Everything the player aims with keeps its screen size at any zoom (`US-MATCH-007` AC6): the scene draws in
      // world units, so each CSS-pixel length is divided by the canvas scale.
      const px = (value: number): number => screenConstant(value, this.screenScale);
      const centerY = frame.y - px(10);
      graphics.lineStyle(px(6), 0x2b3a58, 0.8);
      graphics.strokeCircle(frame.x, centerY, px(RING_RADIUS));
      graphics.lineStyle(px(6), ringColor(this.pullPower), 0.95);
      graphics.beginPath();
      graphics.arc(frame.x, centerY, px(RING_RADIUS), RING_START, RING_START + ringSweep(this.pullPower), false);
      graphics.strokePath();
      graphics.lineStyle(px(2), ringColor(this.pullPower), 0.45);
      graphics.strokeCircle(frame.x, centerY, px(RING_RADIUS + 8));
      // The resolver's own flight, sampled: the same code that will resolve the shot, so it cannot promise a
      // landing the engine will not honour (`US-MATCH-005` AC2).
      const preview = aimPreview({
        state: this.state,
        localSlot: this.localSlot,
        weaponSlot: this.weaponSlot,
        angle: this.pullAngle,
        power: this.pullPower,
        aimDelta: this.aimDelta,
      });
      if (preview) {
        graphics.fillStyle(0xffffff, 0.4);
        for (const dot of preview.path) graphics.fillCircle(dot.x, dot.y, px(2));
        // No impact means the shot leaves the map: a blast ring in the sky would be a promise nobody keeps.
        if (preview.impact) {
          graphics.lineStyle(px(2), 0xffffff, 0.35);
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
  const scene = new BattleScene(options.state, options.localSlot, options.callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: options.parent.clientWidth,
    height: options.parent.clientHeight,
    backgroundColor: "#0b1220",
    scene,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    render: { antialias: true },
  });
  const resize = (): void => {
    game.scale.resize(options.parent.clientWidth, options.parent.clientHeight);
  };
  window.addEventListener("resize", resize);
  return {
    setState: (state, localSlot) => scene.setState(state, localSlot),
    setAimAllowed: (allowed) => scene.setAimAllowed(allowed),
    setWeaponSlot: (slot) => scene.setWeaponSlot(slot),
    setAimDelta: (delta) => scene.setAimDelta(delta),
    destroy: () => {
      window.removeEventListener("resize", resize);
      game.destroy(true);
    },
  };
}

