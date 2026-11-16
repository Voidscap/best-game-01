// LUMEN DRIFT — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between four
// screens: title, play, paused and game over.
//
// ?seed=N fixes the random pattern. ?shot=start|play|late|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_NOVA, EVENT_OVER, EVENT_PICKUP, EVENT_POWERUP, EVENT_SHOT, EVENT_WAVE } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_NOVA, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const elements = {
  hud: document.getElementById('hud'),
  score: document.getElementById('hud-score'),
  best: document.getElementById('hud-best'),
  wave: document.getElementById('hud-wave'),
  lives: document.getElementById('hud-lives'),
  combo: document.getElementById('hud-combo'),
  comboFill: document.getElementById('hud-combo-fill'),
  novaFill: document.getElementById('hud-nova-fill'),
  novaLabel: document.getElementById('hud-nova-label'),
  powers: document.getElementById('hud-powers'),
  titleScreen: document.getElementById('title-screen'),
  titleBest: document.getElementById('title-best'),
  pauseScreen: document.getElementById('pause-screen'),
  overScreen: document.getElementById('over-screen'),
  finalScore: document.getElementById('final-score'),
  finalWave: document.getElementById('final-wave'),
  finalBest: document.getElementById('final-best'),
};

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, elements);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const best = Math.max(readBest(), scene.best);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.click();
    audio.startMusic();
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Three lives. Good luck, pilot.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.over();
    audio.stopMusic();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame();
    } else if (actions & ACTION_RESTART && screen === SCREEN_OVER) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 480, y: 300 }, firing: false, nova: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, {
      move: input.direction(),
      aim: { x: input.mouse.x, y: input.mouse.y },
      firing: input.firing(),
      nova: Boolean(actions & ACTION_NOVA),
    }, false);
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_PICKUP) audio.pickup(world.state.combo);
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_HIT) {
      audio.hit();
      announce(world.state.lives === 1 ? 'Hit. One life left.' : `Hit. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the swarm in.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('LUMEN DRIFT. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
