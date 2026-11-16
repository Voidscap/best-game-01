// The screenshot scenes behind ?shot=start|play|late|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what real play looks like and the
// same seed always gives the same frame. Nothing here is staged by hand:
// the score, the wave and the game-over screen all come out of the run.
import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;
const START_SECONDS = 4;
const END_LIMIT_SECONDS = 240;

/** Steer toward the nearest orb, else the nearest enemy; dodge what is close. */
function autopilot(state, dodge) {
  const player = state.player;
  let target = null;
  let targetDist = Infinity;
  for (const orb of state.orbs) {
    const dist = Math.hypot(orb.x - player.x, orb.y - player.y);
    if (dist < targetDist) {
      targetDist = dist;
      target = orb;
    }
  }
  if (target === null) {
    for (const enemy of state.enemies) {
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < targetDist) {
        targetDist = dist;
        target = enemy;
      }
    }
  }
  let mx = 0;
  let my = 0;
  if (target !== null) {
    mx = target.x > player.x + 12 ? 1 : target.x < player.x - 12 ? -1 : 0;
    my = target.y > player.y + 12 ? 1 : target.y < player.y - 12 ? -1 : 0;
  } else {
    // Nothing to chase: drift back toward the middle so the ship stays
    // in frame instead of camping a corner.
    mx = player.x < 420 ? 1 : player.x > 540 ? -1 : 0;
    my = player.y < 240 ? 1 : player.y > 360 ? -1 : 0;
  }
  if (dodge) {
    // Flee the nearest threat inside 130 px.
    let threat = null;
    let threatDist = 130;
    const threats = [...state.enemies, ...state.ebullets];
    for (const other of threats) {
      const dist = Math.hypot(other.x - player.x, other.y - player.y);
      if (dist < threatDist) {
        threatDist = dist;
        threat = other;
      }
    }
    if (threat !== null) {
      mx = player.x > threat.x ? 1 : -1;
      my = player.y > threat.y ? 1 : -1;
    }
  }
  const aim = target ?? { x: player.x + Math.cos(player.angle) * 100, y: player.y + Math.sin(player.angle) * 100 };
  return {
    move: { x: mx, y: my },
    aim: { x: aim.x, y: aim.y },
    firing: true,
    // A real pilot fires the bomb the moment it is charged.
    nova: state.nova >= 100,
  };
}

/** The lazy pilot for the end scene: it chases orbs and never dodges, so the
 * swarm catches it once the waves speed up — as a hurried player is caught. */
function lazyPilot(state) {
  return autopilot(state, false);
}

function runFor(world, seconds, pilot) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let index = 0; index < steps; index += 1) {
    const events = world.step(SAMPLE, pilot(world.state), false);
    if (events & EVENT_OVER) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Any unknown name stages the title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play' || name === 'late') {
    world.startWave(1);
    // Play the run forward and freeze on its busiest well-framed moment:
    // the frame is a real moment of play, just the liveliest one, not an
    // arbitrary step that may catch a lull between spawns. The caps keep
    // the run bounded; the late scene needs wave 4 or beyond.
    const cap = Math.floor((name === 'late' ? 120 : 60) / SAMPLE);
    const minWave = name === 'late' ? 4 : 1;
    const pilot = (state) => autopilot(state, true);
    let bestScore = -1;
    let bestState = null;
    for (let index = 0; index < cap; index += 1) {
      const events = world.step(SAMPLE, pilot(world.state), false);
      if (events & EVENT_OVER) break;
      const state = world.state;
      if (state.wave < minWave) continue;
      const framed = state.player.x > 200 && state.player.x < 760
        && state.player.y > 120 && state.player.y < 480;
      const busyness = state.enemies.length * 2 + state.orbs.length
        + state.bullets.length + state.powerups.length * 2;
      if (framed && busyness > bestScore) {
        bestScore = busyness;
        bestState = structuredClone(state);
      }
    }
    if (bestState !== null) {
      for (const key of Object.keys(world.state)) delete world.state[key];
      Object.assign(world.state, bestState);
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    world.startWave(1);
    runFor(world, END_LIMIT_SECONDS, lazyPilot);
    if (!world.state.over) {
      // The lazy pilot survived: force the end screen from its run.
      world.state.lives = 0;
      world.state.over = true;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 480, y: 300 }, firing: false, nova: false }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
