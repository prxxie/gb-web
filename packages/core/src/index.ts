/**
 * `@gbw/core` — the rules engine.
 *
 * Nothing here touches the DOM, Phaser or the network (`NFR-22`): the Worker, the browser and the
 * tests all run the same code, which is what makes the host authoritative *and* the replay exact.
 */
export * from "./types.js";
export * from "./tuning.js";
export * from "./rng.js";
export * from "./terrain.js";
export * from "./ballistics.js";
export * from "./combat.js";
export * from "./turn.js";
export * from "./weather.js";
export * from "./movement.js";
export * from "./match.js";
export * from "./snapshot.js";
export * from "./rating.js";
export * from "./room.js";
export * from "./phrases.js";
export * from "./protocol.js";
export * from "./camera.js";
export * from "./senses.js";
export * from "./bot.js";
export * from "./solver.js";
export * from "./gimmicks.js";
export * from "./data/mobiles.js";
export * from "./data/maps.js";
export * from "./data/items.js";
export * from "./data/modes.js";
export * from "./data/avatars.js";
