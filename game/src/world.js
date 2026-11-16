// LUMEN DRIFT — the world: player, enemies, bullets, orbs, power-ups,
// waves, scoring and collisions. Pure simulation: no drawing, no sound,
// no input devices here. `step` advances a fixed slice of time and reports
// what happened as event bits, so the game loop, the autopilot and the
// screenshot scenes all drive the same rules.
import { ARENA, COLORS, COMBO, KINDS, NOVA, PLAYER, POWERUPS, wavePlan } from './config.js';
import { randomInt, randomPick } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE = 4;
export const EVENT_NOVA = 8;
export const EVENT_POWERUP = 16;
export const EVENT_SHOT = 32;
export const EVENT_PICKUP = 64;

const TAU = Math.PI * 2;

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function makeStars(random) {
  const stars = [];
  for (let i = 0; i < 90; i += 1) {
    stars.push({
      x: random() * ARENA.width,
      y: random() * ARENA.height,
      size: 0.6 + random() * 1.6,
      twinkle: random() * TAU,
      speed: 0.4 + random() * 1.2,
    });
  }
  return stars;
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    best: 0,
    wave: 0,
    lives: PLAYER.lives,
    combo: 0,
    comboTime: 0,
    nova: 0,
    shake: 0,
    flash: 0,
    banner: '',
    bannerTime: 0,
    player: null,
    enemies: [],
    bullets: [],
    ebullets: [],
    orbs: [],
    powerups: [],
    particles: [],
    floaters: [],
    stars: makeStars(random),
    spawnQueue: [],
    spawnTimer: 0,
    spawnInterval: 1,
    betweenWaves: 0,
    over: false,
  };

  function freshPlayer() {
    return {
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      vx: 0,
      vy: 0,
      radius: PLAYER.radius,
      angle: -Math.PI / 2,
      fireTimer: 0,
      invuln: 0,
      shield: false,
      spread: 0,
      rapid: 0,
      magnet: 0,
      thrust: 0,
    };
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * TAU;
      const velocity = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.4 + random() * 0.4,
        maxLife: 0.8,
        size: 1.5 + random() * 2.5,
        color,
      });
    }
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function multiplier() {
    return Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perTier));
  }

  function award(points, x, y) {
    const gained = points * multiplier();
    state.score += gained;
    if (x !== undefined) addFloater(x, y, `+${gained}`, COLORS.text);
    return gained;
  }

  function edgeSpawn(kind) {
    const margin = 30;
    const side = Math.floor(random() * 4);
    let x;
    let y;
    if (side === 0) { x = random() * ARENA.width; y = -margin; }
    else if (side === 1) { x = ARENA.width + margin; y = random() * ARENA.height; }
    else if (side === 2) { x = random() * ARENA.width; y = ARENA.height + margin; }
    else { x = -margin; y = random() * ARENA.height; }
    const def = KINDS[kind];
    const hpScale = 1 + Math.floor((state.wave - 1) / 5);
    return {
      kind, x, y,
      vx: 0, vy: 0,
      radius: def.radius,
      hp: kind === 'bloom' ? def.hp + hpScale - 1 : def.hp,
      maxHp: kind === 'bloom' ? def.hp + hpScale - 1 : def.hp,
      speed: def.speed * (1 + (state.wave - 1) * 0.045) * (0.9 + random() * 0.2),
      score: def.score,
      color: def.color,
      angle: random() * TAU,
      fireTimer: 1 + random() * 2,
      lungeTimer: 1 + random(),
      lunging: 0,
      spin: random() * TAU,
    };
  }

  function startWave(n) {
    state.wave = n;
    const plan = wavePlan(n);
    state.spawnInterval = plan.interval;
    state.spawnTimer = 0.6;
    state.spawnQueue = [];
    for (const kind of ['mite', 'dart', 'weaver', 'bloom']) {
      for (let i = 0; i < plan[kind]; i += 1) state.spawnQueue.push(kind);
    }
    // Shuffle the queue so the wave never arrives in kind order.
    for (let i = state.spawnQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [state.spawnQueue[i], state.spawnQueue[j]] = [state.spawnQueue[j], state.spawnQueue[i]];
    }
    state.banner = `WAVE ${n}`;
    state.bannerTime = 2.2;
    return EVENT_WAVE;
  }

  function dropOrb(x, y) {
    state.orbs.push({
      x, y,
      vx: (random() - 0.5) * 120,
      vy: (random() - 0.5) * 120,
      radius: 6,
      life: 9,
      pulse: random() * TAU,
    });
  }

  function dropPowerup(x, y) {
    const kind = randomPick(random, ['spread', 'rapid', 'shield', 'magnet']);
    state.powerups.push({ kind, x, y, radius: 13, life: 10, pulse: random() * TAU });
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.combo += 1;
    state.comboTime = COMBO.windowSeconds;
    state.nova = Math.min(NOVA.max, state.nova + NOVA.killCharge);
    award(enemy.score, enemy.x, enemy.y);
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === 'bloom' ? 26 : 14, 260);
    for (let i = 0; i < 2; i += 1) dropOrb(enemy.x, enemy.y);
    if (enemy.kind === 'bloom') {
      for (let i = 0; i < 3; i += 1) {
        const mite = edgeSpawn('mite');
        mite.x = enemy.x + (random() - 0.5) * 50;
        mite.y = enemy.y + (random() - 0.5) * 50;
        state.enemies.push(mite);
      }
    } else if (random() < 0.09) {
      dropPowerup(enemy.x, enemy.y);
    }
  }

  function hurtPlayer() {
    const player = state.player;
    if (player.invuln > 0) return 0;
    if (player.shield) {
      player.shield = false;
      player.invuln = 1.2;
      burst(player.x, player.y, COLORS.powerShield, 18, 300);
      addFloater(player.x, player.y - 24, 'SHIELD DOWN', COLORS.powerShield);
      return EVENT_HIT;
    }
    state.lives -= 1;
    state.combo = 0;
    state.comboTime = 0;
    state.shake = 14;
    state.flash = 0.35;
    burst(player.x, player.y, COLORS.player, 30, 340);
    player.invuln = PLAYER.invulnSeconds;
    player.vx = 0;
    player.vy = 0;
    if (state.lives <= 0) {
      state.over = true;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireNova() {
    if (state.nova < NOVA.max) return 0;
    state.nova = 0;
    state.ebullets.length = 0;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      enemy.hp -= NOVA.damage;
      if (enemy.hp <= 0) killEnemy(enemy, i);
      else burst(enemy.x, enemy.y, COLORS.orb, 6, 200);
    }
    state.shake = 18;
    state.flash = 0.5;
    burst(state.player.x, state.player.y, COLORS.orb, 40, 520);
    return EVENT_NOVA;
  }

  function stepPlayer(dt, input) {
    const player = state.player;
    let events = 0;
    const move = input.move;
    player.vx += move.x * PLAYER.accel * dt;
    player.vy += move.y * PLAYER.accel * dt;
    const damp = Math.exp(-PLAYER.damping * dt);
    player.vx *= damp;
    player.vy *= damp;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.maxSpeed) {
      player.vx = (player.vx / speed) * PLAYER.maxSpeed;
      player.vy = (player.vy / speed) * PLAYER.maxSpeed;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(player.radius, Math.min(ARENA.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(ARENA.height - player.radius, player.y));
    player.thrust = Math.hypot(move.x, move.y) > 0 ? 1 : 0;
    player.angle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.spread > 0) player.spread -= dt;
    if (player.rapid > 0) player.rapid -= dt;
    if (player.magnet > 0) player.magnet -= dt;

    player.fireTimer -= dt;
    if (input.firing && player.fireTimer <= 0) {
      events |= EVENT_SHOT;
      player.fireTimer = player.rapid > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
      const shots = player.spread > 0 ? [-0.16, 0, 0.16] : [0];
      for (const offset of shots) {
        const angle = player.angle + offset;
        state.bullets.push({
          x: player.x + Math.cos(angle) * (player.radius + 6),
          y: player.y + Math.sin(angle) * (player.radius + 6),
          vx: Math.cos(angle) * PLAYER.bulletSpeed + player.vx * 0.4,
          vy: Math.sin(angle) * PLAYER.bulletSpeed + player.vy * 0.4,
          radius: PLAYER.bulletRadius,
          life: 0.9,
        });
      }
      // A little kick so firing feels physical.
      player.vx -= Math.cos(player.angle) * 14;
      player.vy -= Math.sin(player.angle) * 14;
    }
    return events;
  }

  function stepEnemies(dt) {
    const player = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      if (enemy.kind === 'mite' || enemy.kind === 'bloom') {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
      } else if (enemy.kind === 'dart') {
        enemy.lungeTimer -= dt;
        if (enemy.lungeTimer <= 0) {
          enemy.lunging = 0.45;
          enemy.lungeTimer = 1.6 + random() * 0.8;
        }
        if (enemy.lunging > 0) {
          enemy.lunging -= dt;
          enemy.vx = nx * enemy.speed * 2.1;
          enemy.vy = ny * enemy.speed * 2.1;
        } else {
          enemy.vx = nx * enemy.speed * 0.55;
          enemy.vy = ny * enemy.speed * 0.55;
        }
      } else if (enemy.kind === 'weaver') {
        // Holds a ring around the player and fires slow orbs.
        const want = 250;
        const radial = dist > want + 30 ? 1 : dist < want - 30 ? -1 : 0;
        const tangent = 1;
        enemy.vx = (nx * radial + -ny * tangent * 0.7) * enemy.speed;
        enemy.vy = (ny * radial + nx * tangent * 0.7) * enemy.speed;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && dist < 520) {
          enemy.fireTimer = 2.4;
          state.ebullets.push({
            x: enemy.x, y: enemy.y,
            vx: nx * 170, vy: ny * 170,
            radius: 6, life: 4,
          });
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.spin += dt * 2;
      enemy.x = Math.max(-60, Math.min(ARENA.width + 60, enemy.x));
      enemy.y = Math.max(-60, Math.min(ARENA.height + 60, enemy.y));
    }
  }

  function stepBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > ARENA.width + 20 || bullet.y < -20 || bullet.y > ARENA.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = state.enemies[j];
        const rr = enemy.radius + bullet.radius;
        if (distanceSquared(bullet, enemy) < rr * rr) {
          state.bullets.splice(i, 1);
          enemy.hp -= 1;
          burst(bullet.x, bullet.y, COLORS.bullet, 4, 140);
          if (enemy.hp <= 0) killEnemy(enemy, j);
          break;
        }
      }
    }
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.ebullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > ARENA.width + 20 || bullet.y < -20 || bullet.y > ARENA.height + 20) {
        state.ebullets.splice(i, 1);
      }
    }
  }

  function stepPickups(dt) {
    const player = state.player;
    let events = 0;
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.life -= dt;
      orb.pulse += dt * 6;
      const dist = Math.hypot(player.x - orb.x, player.y - orb.y) || 1;
      const pull = player.magnet > 0 ? 520 : 90;
      if (dist < pull) {
        orb.vx += ((player.x - orb.x) / dist) * 900 * dt;
        orb.vy += ((player.y - orb.y) / dist) * 900 * dt;
      }
      orb.vx *= Math.exp(-2 * dt);
      orb.vy *= Math.exp(-2 * dt);
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      if (dist < player.radius + orb.radius + 6) {
        state.orbs.splice(i, 1);
        events |= EVENT_PICKUP;
        state.combo += 1;
        state.comboTime = COMBO.windowSeconds;
        state.nova = Math.min(NOVA.max, state.nova + NOVA.orbCharge);
        award(25, orb.x, orb.y);
        burst(orb.x, orb.y, COLORS.orb, 5, 120);
      } else if (orb.life <= 0) {
        state.orbs.splice(i, 1);
      }
    }
    for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
      const power = state.powerups[i];
      power.life -= dt;
      power.pulse += dt * 4;
      const rr = player.radius + power.radius + 4;
      if (distanceSquared(power, player) < rr * rr) {
        state.powerups.splice(i, 1);
        events |= EVENT_POWERUP;
        const def = POWERUPS[power.kind];
        if (power.kind === 'shield') player.shield = true;
        else player[power.kind] = def.seconds;
        addFloater(player.x, player.y - 28, def.label, def.color);
        burst(power.x, power.y, def.color, 14, 200);
      } else if (power.life <= 0) {
        state.powerups.splice(i, 1);
      }
    }
    return events;
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-2.4 * dt);
      particle.vy *= Math.exp(-2.4 * dt);
      particle.life -= dt;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const floater = state.floaters[i];
      floater.y -= 34 * dt;
      floater.life -= dt;
      if (floater.life <= 0) state.floaters.splice(i, 1);
    }
    for (const star of state.stars) star.twinkle += dt * star.speed;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    if (state.bannerTime > 0) state.bannerTime -= dt;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.wave = 0;
    state.lives = PLAYER.lives;
    state.combo = 0;
    state.comboTime = 0;
    state.nova = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = '';
    state.bannerTime = 0;
    state.player = freshPlayer();
    state.enemies = [];
    state.bullets = [];
    state.ebullets = [];
    state.orbs = [];
    state.powerups = [];
    state.particles = [];
    state.floaters = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.betweenWaves = 0;
    state.over = false;
  }

  return {
    state,
    reset,
    multiplier,
    startWave,
    /** Advance the world one fixed step. `demo` runs the title-screen drift. */
    step(dt, input, demo = false) {
      let events = 0;
      state.time += dt;
      if (state.comboTime > 0) {
        state.comboTime -= dt;
        if (state.comboTime <= 0) state.combo = 0;
      }
      if (demo) {
        // Title screen: a few mites drift across a calm field, no player.
        if (state.enemies.length < 5 && random() < dt * 0.8) {
          state.enemies.push(edgeSpawn('mite'));
        }
        for (const enemy of state.enemies) {
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
        }
        state.enemies = state.enemies.filter((e) => e.x > -80 && e.x < ARENA.width + 80 && e.y > -80 && e.y < ARENA.height + 80);
        stepParticles(dt);
        return 0;
      }

      events |= stepPlayer(dt, input);
      if (input.nova) events |= fireNova();

      if (state.betweenWaves > 0) {
        state.betweenWaves -= dt;
        if (state.betweenWaves <= 0) events |= startWave(state.wave + 1);
      } else if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = state.spawnInterval;
          state.enemies.push(edgeSpawn(state.spawnQueue.pop()));
        }
      } else if (state.enemies.length === 0 && !state.over) {
        // Wave cleared: bonus, then the next wave.
        award(250 * state.wave, state.player.x, state.player.y - 30);
        state.betweenWaves = 2.5;
        state.banner = `WAVE ${state.wave} CLEAR  +${250 * state.wave}`;
        state.bannerTime = 2.2;
      }

      stepEnemies(dt);
      stepBullets(dt);
      events |= stepPickups(dt);

      // Touching an enemy hurts, unless it just spawned off-screen.
      for (const enemy of state.enemies) {
        const rr = enemy.radius + state.player.radius - 2;
        if (distanceSquared(enemy, state.player) < rr * rr) {
          events |= hurtPlayer();
          break;
        }
      }
      for (const bullet of state.ebullets) {
        const rr = bullet.radius + state.player.radius - 2;
        if (distanceSquared(bullet, state.player) < rr * rr) {
          state.ebullets.splice(state.ebullets.indexOf(bullet), 1);
          events |= hurtPlayer();
          break;
        }
      }

      stepParticles(dt);
      return events;
    },
  };
}
