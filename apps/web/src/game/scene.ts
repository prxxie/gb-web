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
  panBy,
  pinchTo,
  powerRingRadius,
  rulerLayout,
  simulateFlight,
  launch,
  getMobile,
  getMap,
  type CameraWindow,
  type MatchState,
  type PlayerState,
} from "@gbw/core";
import { addPointer, classify, clearPointers, movePointer, removePointer, screenToWorld, viewportFor, type Point, type PointerState } from "./viewport";

export interface BattleCallbacks {
  readonly onPull: (power: number, angle: number) => void;
  readonly onRelease: (power: number, angle: number) => void;
  readonly onCancel: () => void;
  readonly onCamera: (window: CameraWindow) => void;
}

export interface BattleHandle {
  setState(state: MatchState, localSlot: number): void;
  destroy(): void;
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
  private pointers: PointerState = clearPointers();
  private origin: Point | null = null;
  private previousSpread: number | null = null;
  private pullPower = 0;
  private pullAngle = 0;
  private pointerHandlers: Array<{ type: string; handler: (event: PointerEvent) => void }> = [];

  constructor(state: MatchState, localSlot: number, callbacks: BattleCallbacks) {
    super("battle");
    this.state = state;
    this.localSlot = localSlot;
    this.callbacks = callbacks;
    this.window = defaultWindow(16 / 9);
  }

  setState(state: MatchState, localSlot: number): void {
    this.state = state;
    this.localSlot = localSlot;
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#0b1220");
    this.attachPointerHandlers();
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
        this.origin = toPoint(event);
        this.pullPower = 0;
        this.pullAngle = 0;
      } else {
        this.previousSpread = this.spread();
        this.origin = null;
        this.callbacks.onCancel();
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
        else this.callbacks.onCancel();
      }
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

  private interpret(point: Point): void {
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
      const world = screenToWorld(this.window, viewportFor(this.window, this.scale.width, this.scale.height), point.x, point.y);
      this.window = panBy(this.window, gesture.dx, gesture.dy, this.scale.width);
      this.callbacks.onCamera(this.window);
      void world;
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

    for (const player of this.state.players) this.drawPlayer(graphics, player);
    this.drawAim(graphics);
    void height;
  }

  private drawPlayer(graphics: Phaser.GameObjects.Graphics, player: PlayerState): void {
    const mobile = getMobile(player.mobileId);
    const bodyWidth = 44;
    const bodyHeight = 20;
    if (player.eliminated) {
      graphics.lineStyle(3, 0x7a4a4a, 0.9);
      graphics.lineBetween(player.x - bodyWidth / 2, player.y - bodyHeight / 2, player.x + bodyWidth / 2, player.y + bodyHeight / 2);
      graphics.lineBetween(player.x + bodyWidth / 2, player.y - bodyHeight / 2, player.x - bodyWidth / 2, player.y + bodyHeight / 2);
      return;
    }
    const accent = player.team === "A" ? 0x4f9dff : 0xff7043;
    graphics.fillStyle(accent, 1);
    graphics.fillRoundedRect(player.x - bodyWidth / 2, player.y - bodyHeight, bodyWidth, bodyHeight, 4);
    graphics.lineStyle(3, 0x101820, 1);
    const barrelLength = 34;
    const muzzleAngle = ((this.pullAngleFor(player) * Math.PI) / 180) * -1;
    graphics.lineBetween(
      player.x,
      player.y - bodyHeight,
      player.x + Math.cos(muzzleAngle) * barrelLength * player.facing,
      player.y - bodyHeight + Math.sin(muzzleAngle) * barrelLength,
    );
    // Health bar.
    const ratio = Math.max(0, Math.min(1, player.hp / Math.max(1, getMobile(player.mobileId).maxHp)));
    graphics.fillStyle(0x101820, 0.9);
    graphics.fillRect(player.x - 24, player.y - bodyHeight - 14, 48, 6);
    graphics.fillStyle(ratio > 0.5 ? 0x5cd67a : ratio > 0.25 ? 0xf2c14e : 0xe5544b, 1);
    graphics.fillRect(player.x - 24, player.y - bodyHeight - 14, 48 * ratio, 6);
    if (player.shield > 0) {
      graphics.lineStyle(2, 0x7fd6ff, 0.8);
      graphics.strokeCircle(player.x, player.y - bodyHeight / 2, 30);
    }
    void mobile;
  }

  private pullAngleFor(player: PlayerState): number {
    if (player.slot !== this.localSlot || this.origin === null) return 45;
    return this.pullAngle;
  }

  private drawAim(graphics: Phaser.GameObjects.Graphics): void {
    const player = this.state.players.find((candidate) => candidate.slot === this.localSlot);
    if (!player || player.eliminated) return;
    const mobile = getMobile(player.mobileId);
    const map = getMap(this.state.mapId);

    if (this.pullPower > 0) {
      const radius = powerRingRadius(this.pullPower);
      for (let ring = 0; ring < 12; ring += 1) {
        graphics.lineStyle(3, 0x4f9dff, 0.12 + (ring / 12) * 0.5);
        graphics.strokeCircle(player.x, player.y - 10, radius * (1 - ring / 16));
      }
      const projectile = launch({
        id: 1,
        ownerSlot: player.slot,
        weaponSlot: 0,
        weapon: mobile.weapons[0]!,
        from: { x: player.x, y: player.y },
        facing: player.facing,
        angle: this.pullAngle,
        force: Math.round(this.pullPower * 25),
        powerMultiplier: 1,
        bunge: false,
      });
      const flight = simulateFlight(
        projectile,
        {
          wind: this.state.weather.wind,
          gravity: mobile.gravity * map.gravityModifier,
          mass: mobile.mass,
          stepMs: TUNABLES.stepMs,
        },
        { step: this.state.terrainStep, heights: Float64Array.from(this.state.terrain), width: TUNABLES.mapWidth },
      );
      // A dotted arc from the muzzle to the predicted impact: the player sees where the shot goes.
      if (flight.impact) {
        const steps = 14;
        const from = { x: player.x, y: player.y };
        graphics.fillStyle(0xffffff, 0.4);
        for (let index = 1; index <= steps; index += 1) {
          const t = index / steps;
          const x = from.x + (flight.impact.x - from.x) * t;
          const arc = Math.sin(Math.PI * t) * 90;
          const y = from.y + (flight.impact.y - from.y) * t - arc;
          graphics.fillCircle(x, y, 2);
        }
        graphics.lineStyle(1, 0xffffff, 0.35);
        graphics.strokeCircle(flight.impact.x, flight.impact.y, 8);
      }
    }
  }

  shutdown(): void {
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
    destroy: () => {
      window.removeEventListener("resize", resize);
      game.destroy(true);
    },
  };
}

