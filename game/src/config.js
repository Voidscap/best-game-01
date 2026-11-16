// LUMEN DRIFT — tuning and palette in one place. Every number the game
// plays by lives here, so balancing is editing this file, not the logic.
export const ARENA = { width: 960, height: 600 };
export const STEP = 1 / 60;

export const COLORS = {
  background: '#070a1a',
  nebulaA: '#141b3d',
  nebulaB: '#241239',
  player: '#35f1ff',
  playerCore: '#e8feff',
  bullet: '#aef7ff',
  mite: '#ff3d81',
  dart: '#ff7a3d',
  weaver: '#c95bff',
  bloom: '#ff4d6d',
  enemyBullet: '#ff5c8a',
  orb: '#ffc44d',
  powerSpread: '#7dff5e',
  powerRapid: '#35f1ff',
  powerShield: '#8fa8ff',
  powerMagnet: '#ff9de2',
  text: '#eef4ff',
  dimText: '#8fa0c9',
  danger: '#ff4d5e',
};

export const PLAYER = {
  radius: 13,
  accel: 1500,
  maxSpeed: 340,
  damping: 2.6,
  fireInterval: 0.14,
  rapidInterval: 0.08,
  bulletSpeed: 640,
  bulletRadius: 4,
  invulnSeconds: 2,
  lives: 3,
};

export const COMBO = {
  windowSeconds: 3,
  perTier: 4,
  maxMultiplier: 5,
};

export const NOVA = {
  max: 100,
  orbCharge: 9,
  killCharge: 6,
  damage: 3,
};

// Enemy kinds: speed, radius, hit points, score, the wave they first appear in.
export const KINDS = {
  mite: { speed: 72, radius: 13, hp: 1, score: 100, firstWave: 1, color: COLORS.mite },
  dart: { speed: 150, radius: 11, hp: 1, score: 150, firstWave: 2, color: COLORS.dart },
  weaver: { speed: 58, radius: 15, hp: 2, score: 250, firstWave: 3, color: COLORS.weaver },
  bloom: { speed: 42, radius: 24, hp: 3, score: 300, firstWave: 4, color: COLORS.bloom },
};

export const POWERUPS = {
  spread: { seconds: 12, color: COLORS.powerSpread, label: 'SPREAD' },
  rapid: { seconds: 12, color: COLORS.powerRapid, label: 'RAPID' },
  shield: { seconds: 0, color: COLORS.powerShield, label: 'SHIELD' },
  magnet: { seconds: 12, color: COLORS.powerMagnet, label: 'MAGNET' },
};

/** What wave n spawns: counts per kind and the gap between spawns. */
export function wavePlan(n) {
  const total = 8 + n * 4;
  const plan = { mite: total, dart: 0, weaver: 0, bloom: 0 };
  if (n >= 2) plan.dart = 2 + n;
  if (n >= 3) plan.weaver = 1 + Math.floor(n / 2);
  if (n >= 4) plan.bloom = Math.floor(n / 2);
  return { ...plan, interval: Math.max(0.4, 1.0 - n * 0.07) };
}

export const BEST_KEY = 'lumen-drift-best';
