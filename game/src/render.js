// LUMEN DRIFT — everything the player sees: the canvas world (arena, ships,
// bullets, particles) and the DOM HUD and screens (score, lives, title,
// game over). The HUD is DOM so it stays crisp when the screenshots are
// shrunk; the playfield is canvas so it can glow.
import { ARENA, COLORS, COMBO, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

function hearts(lives) {
  return '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, PLAYER.lives - lives));
}

export function createRenderer(canvas, elements) {
  const ctx = canvas.getContext('2d');
  canvas.width = ARENA.width;
  canvas.height = ARENA.height;
  let lastHud = '';

  function drawBackground(state) {
    const gradient = ctx.createRadialGradient(
      ARENA.width / 2, ARENA.height / 2, 80,
      ARENA.width / 2, ARENA.height / 2, 700,
    );
    gradient.addColorStop(0, COLORS.nebulaA);
    gradient.addColorStop(0.55, COLORS.nebulaB);
    gradient.addColorStop(1, COLORS.background);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    // Faint grid, so motion reads even in empty space.
    ctx.strokeStyle = 'rgba(120, 150, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= ARENA.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA.height);
    }
    for (let y = 0; y <= ARENA.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA.width, y);
    }
    ctx.stroke();
    for (const star of state.stars) {
      const alpha = 0.35 + 0.4 * Math.abs(Math.sin(star.twinkle));
      ctx.fillStyle = `rgba(220, 235, 255, ${alpha.toFixed(3)})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  function drawOrb(orb) {
    const pulse = 1 + 0.25 * Math.sin(orb.pulse);
    ctx.save();
    ctx.shadowColor = COLORS.orb;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.orb;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius * pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius * 0.45 * pulse, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPowerup(power) {
    const pulse = 1 + 0.2 * Math.sin(power.pulse);
    ctx.save();
    ctx.translate(power.x, power.y);
    ctx.rotate(Math.sin(power.pulse * 0.5) * 0.2);
    ctx.shadowColor = power.color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = power.color;
    ctx.lineWidth = 2;
    const r = power.radius * pulse;
    ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    ctx.fillStyle = power.color;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = { spread: '✦', rapid: '≫', shield: '⬢', magnet: '◉' }[power.kind] ?? '?';
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = enemy.color;
    ctx.lineWidth = 2;
    if (enemy.kind === 'mite') {
      ctx.rotate(enemy.spin * 0.4);
      ctx.beginPath();
      ctx.moveTo(0, -enemy.radius);
      ctx.lineTo(enemy.radius * 0.85, enemy.radius * 0.8);
      ctx.lineTo(-enemy.radius * 0.85, enemy.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.kind === 'dart') {
      ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
      ctx.beginPath();
      ctx.moveTo(enemy.radius * 1.3, 0);
      ctx.lineTo(-enemy.radius, enemy.radius * 0.7);
      ctx.lineTo(-enemy.radius * 0.5, 0);
      ctx.lineTo(-enemy.radius, -enemy.radius * 0.7);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.kind === 'weaver') {
      ctx.rotate(enemy.spin);
      for (let i = 0; i < 6; i += 1) {
        ctx.rotate(TAU / 6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(enemy.radius, enemy.radius * 0.35);
        ctx.lineTo(enemy.radius, -enemy.radius * 0.35);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
    } else {
      // bloom: a big ringed splitter.
      ctx.rotate(enemy.spin * 0.3);
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(7, 10, 26, 0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.55, 0, TAU);
      ctx.fill();
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.28, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (enemy.maxHp > 1 && enemy.hp < enemy.maxHp) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.radius - 10, 28, 4);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.radius - 10, 28 * (enemy.hp / enemy.maxHp), 4);
    }
  }

  function drawPlayer(player, time) {
    const blink = player.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.shield) {
      ctx.strokeStyle = 'rgba(143, 168, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.shadowColor = COLORS.powerShield;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, player.radius + 9 + Math.sin(time * 5) * 2, 0, TAU);
      ctx.stroke();
    }
    ctx.rotate(player.angle);
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    if (player.thrust) {
      // Engine flame, flickering.
      const flicker = 8 + Math.random() * 8;
      ctx.fillStyle = '#ff9d3d';
      ctx.beginPath();
      ctx.moveTo(-10, 5);
      ctx.lineTo(-10 - flicker, 0);
      ctx.lineTo(-10, -5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-11, 11);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(2, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBullets(state) {
    ctx.save();
    ctx.shadowColor = COLORS.bullet;
    ctx.shadowBlur = 8;
    ctx.fillStyle = COLORS.bullet;
    for (const bullet of state.bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      ctx.fill();
    }
    ctx.shadowColor = COLORS.enemyBullet;
    ctx.fillStyle = COLORS.enemyBullet;
    for (const bullet of state.ebullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const floater of state.floaters) {
      ctx.globalAlpha = Math.min(1, floater.life * 2);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner(state) {
    if (state.bannerTime <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.bannerTime);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 18;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(state.banner, ARENA.width / 2, 92);
    ctx.restore();
  }

  function updateHud(state, screen, best) {
    const mult = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perTier));
    const powers = [];
    if (state.player) {
      if (state.player.spread > 0) powers.push(`SPREAD ${Math.ceil(state.player.spread)}s`);
      if (state.player.rapid > 0) powers.push(`RAPID ${Math.ceil(state.player.rapid)}s`);
      if (state.player.magnet > 0) powers.push(`MAGNET ${Math.ceil(state.player.magnet)}s`);
      if (state.player.shield) powers.push('SHIELD');
    }
    const key = [
      state.score, best, state.wave, state.lives, state.combo, mult,
      Math.round(state.nova), powers.join('|'), screen,
    ].join('/');
    if (key === lastHud) return;
    lastHud = key;
    elements.score.textContent = String(state.score).padStart(6, '0');
    elements.best.textContent = `BEST ${best}`;
    elements.wave.textContent = state.wave > 0 ? `WAVE ${state.wave}` : 'WAVE –';
    elements.lives.textContent = hearts(state.lives);
    elements.combo.textContent = mult > 1 ? `COMBO ×${mult}` : '';
    elements.comboFill.style.width = `${Math.min(100, (state.comboTime / COMBO.windowSeconds) * 100)}%`;
    elements.novaFill.style.width = `${Math.round(state.nova)}%`;
    elements.novaLabel.textContent = state.nova >= 100 ? 'NOVA READY — E / RIGHT CLICK' : 'NOVA';
    elements.powers.textContent = powers.join('  ·  ');
    elements.titleScreen.classList.toggle('hidden', screen !== SCREEN_TITLE);
    elements.overScreen.classList.toggle('hidden', screen !== SCREEN_OVER);
    elements.pauseScreen.classList.toggle('hidden', screen !== SCREEN_PAUSED);
    elements.hud.classList.toggle('hidden', screen === SCREEN_TITLE);
    if (screen === SCREEN_OVER) {
      elements.finalScore.textContent = String(state.score).padStart(6, '0');
      elements.finalWave.textContent = `WAVE ${state.wave}`;
      elements.finalBest.textContent = `BEST ${best}`;
    }
    if (screen === SCREEN_TITLE) {
      elements.titleBest.textContent = best > 0 ? `BEST ${best}` : 'NO PILOT HAS FLOWN YET';
    }
  }

  return {
    draw(state, screen, best) {
      ctx.save();
      if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      drawBackground(state);
      for (const orb of state.orbs) drawOrb(orb);
      for (const power of state.powerups) drawPowerup(power);
      for (const enemy of state.enemies) drawEnemy(enemy);
      if (state.player && screen !== SCREEN_TITLE) drawPlayer(state.player, state.time);
      drawBullets(state);
      drawParticles(state);
      drawBanner(state);
      ctx.restore();
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 60, 80, ${(state.flash * 0.55).toFixed(3)})`;
        ctx.fillRect(0, 0, ARENA.width, ARENA.height);
      }
      updateHud(state, screen, best);
    },
  };
}
