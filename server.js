const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ============ КОНСТАНТЫ ============
const ARENA_W = 1200;
const ARENA_H = 700;
const PLAYER_RADIUS = 18;
const BULLET_SPEED = 9;
const BASE_FIRE_RATE = 500;
const ROUND_TIME = 480; // 8 минут
const BOSS_TIME = 60;   // 1 минута на босса
const PICKUP_INTERVAL = 10000;
const MAX_CARDS = 6;

// ============ КАРТЫ ============
const MAPS = [
  {
    name: '🏟️ Арена',
    walls: [],
  },
  {
    name: '🏛️ Колонны',
    walls: [
      { x: 300, y: 200, w: 60, h: 60 },
      { x: 840, y: 200, w: 60, h: 60 },
      { x: 300, y: 440, w: 60, h: 60 },
      { x: 840, y: 440, w: 60, h: 60 },
      { x: 570, y: 320, w: 60, h: 60 },
    ],
  },
  {
    name: '🏰 Крепость',
    walls: [
      { x: 200, y: 150, w: 200, h: 30 },
      { x: 800, y: 150, w: 200, h: 30 },
      { x: 200, y: 520, w: 200, h: 30 },
      { x: 800, y: 520, w: 200, h: 30 },
      { x: 560, y: 100, w: 80, h: 200 },
      { x: 560, y: 400, w: 80, h: 200 },
    ],
  },
  {
    name: '🌊 Лабиринт',
    walls: [
      { x: 150, y: 100, w: 30, h: 300 },
      { x: 150, y: 500, w: 30, h: 150 },
      { x: 1020, y: 100, w: 30, h: 150 },
      { x: 1020, y: 300, w: 30, h: 300 },
      { x: 400, y: 200, w: 30, h: 300 },
      { x: 770, y: 200, w: 30, h: 300 },
    ],
  },
];

// ============ КАРТОЧКИ ============
const UPGRADE_CARDS = [
  { id: 'damage',    name: '💥 Урон',        color: '#e74c3c', apply: p => p.damage *= 1.25 },
  { id: 'fireRate',  name: '⚡ Скорострел',  color: '#f39c12', apply: p => p.fireRate *= 0.8 },
  { id: 'speed',     name: '🏃 Скорость',    color: '#2ecc71', apply: p => p.speed *= 1.15 },
  { id: 'hp',        name: '❤️ Здоровье',    color: '#ff6b9d', apply: p => { p.maxHp += 30; p.hp += 30; } },
  { id: 'bulletSize',name: '🎯 Большие пули',color: '#9b59b6', apply: p => p.bulletSize *= 1.3 },
  { id: 'pierce',    name: '🗡️ Пробивание',  color: '#1abc9c', apply: p => p.pierce += 1 },
  { id: 'multishot', name: '🔫 Мультивыстрел',color:'#3498db', apply: p => p.multishot += 1 },
  { id: 'bounce',    name: '↩️ Рикошет',     color: '#e67e22', apply: p => p.bounce += 1 },
  { id: 'regen',     name: '✨ Регенерация', color: '#16a085', apply: p => p.regen += 0.5 },
  { id: 'range',     name: '📏 Дальность',   color: '#8e44ad', apply: p => p.bulletRange *= 1.4 },
];

// ============ РАНГИ ============
const RANKS = [
  { name: '🥉 Bronze',   min: 0 },
  { name: '🥈 Silver',   min: 500 },
  { name: '🥇 Gold',     min: 1500 },
  { name: '💎 Platinum', min: 3000 },
  { name: '💠 Diamond',  min: 6000 },
  { name: '👑 Master',   min: 10000 },
  { name: '🌟 Legend',   min: 20000 },
];

function getRank(xp) {
  let rank = RANKS[0];
  for (const r of RANKS) if (xp >= r.min) rank = r;
  return rank;
}

// ============ СОСТОЯНИЕ ============
const players = new Map();
const bullets = [];
const cards = [];
const grenades = [];
const playerStats = new Map(); // { name: { xp, wins, kills } }

let roundNumber = 0;
let roundStartTime = 0;
let roundState = 'waiting'; // waiting | playing | boss | ended
let currentMap = MAPS[0];
let lastCardDrop = 0;
let boss = null;

// ============ БОСС ============
function spawnBoss() {
  const hp = 1500 + roundNumber * 500;
  boss = {
    x: ARENA_W / 2, y: ARENA_H / 2,
    vx: 0, vy: 0,
    radius: 60,
    hp, maxHp: hp,
    damage: 25 + roundNumber * 5,
    speed: 1.5 + roundNumber * 0.1,
    lastShot: 0,
    fireRate: 1200,
    angle: 0,
    phase: 0, // для паттернов атак
    phaseTime: Date.now(),
  };
}

function updateBoss(now) {
  if (!boss) return;
  // Движение к ближайшему игроку
  let target = null, minDist = Infinity;
  for (const p of players.values()) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - boss.x, p.y - boss.y);
    if (d < minDist) { minDist = d; target = p; }
  }
  if (target) {
    const ang = Math.atan2(target.y - boss.y, target.x - boss.x);
    boss.angle = ang;
    boss.x += Math.cos(ang) * boss.speed;
    boss.y += Math.sin(ang) * boss.speed;
    boss.x = Math.max(boss.radius, Math.min(ARENA_W - boss.radius, boss.x));
    boss.y = Math.max(boss.radius, Math.min(ARENA_H - boss.radius, boss.y));

    // Стрельба
    if (now - boss.lastShot > boss.fireRate) {
      boss.lastShot = now;
      const pattern = Math.floor((now - boss.phaseTime) / 4000) % 3;
      if (pattern === 0) {
        // Одиночный выстрел
        bullets.push(makeBossBullet(ang, boss.damage));
      } else if (pattern === 1) {
        // Веер из 5 пуль
        for (let i = -2; i <= 2; i++) {
          bullets.push(makeBossBullet(ang + i * 0.2, boss.damage * 0.7));
        }
      } else {
        // Кольцо из 12 пуль
        for (let i = 0; i < 12; i++) {
          bullets.push(makeBossBullet((Math.PI * 2 * i) / 12, boss.damage * 0.5));
        }
      }
    }
  }

  // Столкновение с игроками (контактный урон)
  for (const p of players.values()) {
    if (!p.alive || p.shield > 0) continue;
    if (Math.hypot(p.x - boss.x, p.y - boss.y) < PLAYER_RADIUS + boss.radius) {
      p.hp -= boss.damage * 0.3;
      if (p.hp <= 0) killPlayer(p, null);
    }
  }
}

function makeBossBullet(angle, damage) {
  return {
    id: Math.random().toString(36).slice(2),
    ownerId: 'boss',
    x: boss.x + Math.cos(angle) * (boss.radius + 5),
    y: boss.y + Math.sin(angle) * (boss.radius + 5),
    vx: Math.cos(angle) * 6,
    vy: Math.sin(angle) * 6,
    damage, size: 8,
    pierce: 0, bounce: 0,
    traveled: 0, maxRange: 1200,
    hit: new Set(),
    isBoss: true,
  };
}

// ============ ИГРОК ============
function createPlayer(id, name) {
  return {
    id, name: name || `Player${id.slice(0,4)}`,
    x: 100 + Math.random() * (ARENA_W - 200),
    y: 100 + Math.random() * (ARENA_H - 200),
    angle: 0, hp: 100, maxHp: 100,
    speed: 3.2, damage: 20, fireRate: BASE_FIRE_RATE,
    bulletSize: 5, bulletRange: 600,
    pierce: 0, bounce: 0, multishot: 1, regen: 0,
    lastShot: 0, kills: 0, alive: true,
    keys: {}, mouse: { x: 0, y: 0, down: false },
    respawnAt: 0,
    // Способности
    dashCd: 0, shieldCd: 0, grenadeCd: 0,
    dashUntil: 0, shield: 0, // shield — время действия щита
    dashVx: 0, dashVy: 0,
  };
}

function respawnPlayer(p) {
  let tries = 0;
  while (tries < 20) {
    const x = 100 + Math.random() * (ARENA_W - 200);
    const y = 100 + Math.random() * (ARENA_H - 200);
    if (!collidesWalls(x, y, PLAYER_RADIUS)) {
      p.x = x; p.y = y; break;
    }
    tries++;
  }
  p.hp = p.maxHp;
  p.alive = true;
  p.respawnAt = 0;
}

// ============ КОЛЛИЗИИ СО СТЕНАМИ ============
function collidesWalls(x, y, r) {
  for (const w of currentMap.walls) {
    const cx = Math.max(w.x, Math.min(x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(y, w.y + w.h));
    if (Math.hypot(x - cx, y - cy) < r) return true;
  }
  return false;
}

function bulletHitsWall(b) {
  for (const w of currentMap.walls) {
    const cx = Math.max(w.x, Math.min(b.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(b.y, w.y + w.h));
    if (Math.hypot(b.x - cx, b.y - cy) < b.size) return true;
  }
  return false;
}

function pushOutOfWalls(p) {
  for (const w of currentMap.walls) {
    const cx = Math.max(w.x, Math.min(p.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
    const dx = p.x - cx, dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < PLAYER_RADIUS) {
      if (dist === 0) { p.x += PLAYER_RADIUS; continue; }
      const push = (PLAYER_RADIUS - dist) / dist;
      p.x += dx * push;
      p.y += dy * push;
    }
  }
}

// ============ РАУНДЫ ============
function startRound() {
  roundNumber++;
  roundStartTime = Date.now();
  roundState = 'playing';
  bullets.length = 0;
  cards.length = 0;
  grenades.length = 0;
  boss = null;
  lastCardDrop = Date.now();
  currentMap = MAPS[(roundNumber - 1) % MAPS.length];

  for (const p of players.values()) {
    respawnPlayer(p);
  }

  io.emit('roundStart', {
    round: roundNumber,
    time: ROUND_TIME,
    map: currentMap.name,
    walls: currentMap.walls,
  });
  console.log(`🎯 Раунд ${roundNumber} | Карта: ${currentMap.name}`);
}

function startBossPhase() {
  roundState = 'boss';
  roundStartTime = Date.now();
  bullets.length = 0;
  grenades.length = 0;
  spawnBoss();
  for (const p of players.values()) {
    if (!p.alive) respawnPlayer(p);
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); // хил перед боссом
  }
  io.emit('bossStart', { hp: boss.hp, maxHp: boss.maxHp, time: BOSS_TIME });
  console.log(`👹 БОСС ${roundNumber} появился! HP: ${boss.maxHp}`);
}

function endRound(winner) {
  roundState = 'ended';
  const leaderboard = [...players.values()]
    .map(p => ({ name: p.name, kills: p.kills }))
    .sort((a, b) => b.kills - a.kills);

  // Начисляем XP
  for (const [i, p] of leaderboard.entries()) {
    const stats = getStats(p.name);
    stats.kills += p.kills;
    stats.xp += p.kills * 100;
    if (i === 0 && p.kills > 0) { stats.xp += 200; stats.wins++; }
  }

  io.emit('roundEnd', { leaderboard, nextIn: 5000, winner: winner?.name });
  setTimeout(() => {
    if (players.size >= 1) {
      if (roundNumber % 2 === 0) startBossPhase(); // босс каждые 2 раунда
      else startRound();
    } else roundState = 'waiting';
  }, 5000);
}

function endBossPhase(alive) {
  roundState = 'ended';
  const participants = [...players.values()].filter(p => p.alive);
  const leaderboard = participants
    .map(p => ({ name: p.name, kills: p.kills }))
    .sort((a, b) => b.kills - a.kills);

  // XP за босса
  for (const p of participants) {
    const stats = getStats(p.name);
    stats.xp += 500;
    stats.kills += p.kills;
  }

  io.emit('bossEnd', {
    alive: alive,
    leaderboard,
    nextIn: 5000,
    reward: alive ? 500 : 0,
  });
  setTimeout(() => {
    if (players.size >= 1) startRound();
    else roundState = 'waiting';
  }, 5000);
}

function getStats(name) {
  if (!playerStats.has(name)) {
    playerStats.set(name, { xp: 0, wins: 0, kills: 0 });
  }
  return playerStats.get(name);
}

// ============ СТРЕЛЬБА ============
function shoot(player, now) {
  if (now - player.lastShot < player.fireRate) return;
  player.lastShot = now;
  const baseAngle = player.angle;
  const spread = 0.15;
  for (let i = 0; i < player.multishot; i++) {
    let angle = baseAngle;
    if (player.multishot > 1) angle += (i - (player.multishot - 1) / 2) * spread;
    bullets.push({
      id: Math.random().toString(36).slice(2),
      ownerId: player.id,
      x: player.x + Math.cos(angle) * (PLAYER_RADIUS + 5),
      y: player.y + Math.sin(angle) * (PLAYER_RADIUS + 5),
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      damage: player.damage,
      size: player.bulletSize,
      pierce: player.pierce,
      bounce: player.bounce,
      traveled: 0,
      maxRange: player.bulletRange,
      hit: new Set(),
    });
  }
}

// ============ СПОСОБНОСТИ ============
function useDash(p) {
  const now = Date.now();
  if (p.dashCd > now || !p.alive) return;
  p.dashCd = now + 4000;
  p.dashUntil = now + 200;
  const ang = p.angle;
  p.dashVx = Math.cos(ang) * 18;
  p.dashVy = Math.sin(ang) * 18;
  io.emit('ability', { type: 'dash', playerId: p.id, x: p.x, y: p.y, angle: ang });
}

function useShield(p) {
  const now = Date.now();
  if (p.shieldCd > now || !p.alive) return;
  p.shieldCd = now + 10000;
  p.shield = now + 3000;
  io.emit('ability', { type: 'shield', playerId: p.id });
}

function useGrenade(p) {
  const now = Date.now();
  if (p.grenadeCd > now || !p.alive) return;
  p.grenadeCd = now + 8000;
  const ang = p.angle;
  grenades.push({
    id: Math.random().toString(36).slice(2),
    ownerId: p.id,
    x: p.x + Math.cos(ang) * 30,
    y: p.y + Math.sin(ang) * 30,
    vx: Math.cos(ang) * 7,
    vy: Math.sin(ang) * 7,
    detonateAt: now + 1200,
    damage: 80,
    radius: 120,
  });
}

function killPlayer(p, killer) {
  p.alive = false;
  p.respawnAt = Date.now() + 3000;
  if (killer) {
    killer.kills++;
    const stats = getStats(killer.name);
    stats.xp += 50; // за каждое убийство
    io.emit('playerKilled', { victim: p.name, killer: killer.name });
  } else {
    io.emit('playerKilled', { victim: p.name, killer: 'Босс' });
  }
}

// ============ UPDATE ============
function update() {
  const now = Date.now();

  // Проверка времени раунда
  if (roundState === 'playing') {
    const elapsed = (now - roundStartTime) / 1000;
    if (elapsed >= ROUND_TIME) { endRound(); return; }
    const alive = [...players.values()].filter(p => p.alive);
    if (players.size >= 2 && alive.length <= 1) { endRound(alive[0]); return; }
  } else if (roundState === 'boss') {
    const elapsed = (now - roundStartTime) / 1000;
    if (elapsed >= BOSS_TIME || !boss || boss.hp <= 0) {
      const alive = boss && boss.hp <= 0;
      endBossPhase(alive);
      return;
    }
  }

  // Игроки
  for (const p of players.values()) {
    if (p.regen > 0 && p.alive && p.shield <= 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.regen / 60);
    }
    if (!p.alive) {
      if (now >= p.respawnAt && roundState === 'playing') respawnPlayer(p);
      continue;
    }

    // Dash
    if (now < p.dashUntil) {
      p.x += p.dashVx;
      p.y += p.dashVy;
    } else {
      let dx = 0, dy = 0;
      if (p.keys['w'] || p.keys['ц'] || p.keys['arrowup']) dy -= 1;
      if (p.keys['s'] || p.keys['ы'] || p.keys['arrowdown']) dy += 1;
      if (p.keys['a'] || p.keys['ф'] || p.keys['arrowleft']) dx -= 1;
      if (p.keys['d'] || p.keys['в'] || p.keys['arrowright']) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        p.x += (dx / len) * p.speed;
        p.y += (dy / len) * p.speed;
      }
    }

    p.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, p.y));
    pushOutOfWalls(p);

    if (p.mouse.down) shoot(p, now);
  }

  // Пули
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy;
    b.traveled += BULLET_SPEED;

    // Стены
    if (bulletHitsWall(b)) {
      if (b.bounce > 0) {
        b.vx *= -1; b.vy *= -1; b.bounce--;
      } else { bullets.splice(i, 1); continue; }
    }

    // Границы
    if (b.x < b.size || b.x > ARENA_W - b.size) {
      if (b.bounce > 0) { b.vx *= -1; b.bounce--; }
      else { bullets.splice(i, 1); continue; }
    }
    if (b.y < b.size || b.y > ARENA_H - b.size) {
      if (b.bounce > 0) { b.vy *= -1; b.bounce--; }
      else { bullets.splice(i, 1); continue; }
    }
    if (b.traveled > b.maxRange) { bullets.splice(i, 1); continue; }

    // Попадание в босса
    if (boss && b.ownerId !== 'boss') {
      if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.radius + b.size && !b.hit.has('boss')) {
        boss.hp -= b.damage;
        b.hit.add('boss');
        io.emit('bossHit', { hp: boss.hp, maxHp: boss.maxHp });
        if (b.pierce > 0) b.pierce--;
        else { bullets.splice(i, 1); continue; }
      }
    }

    // Попадание в игроков
    let removed = false;
    for (const p of players.values()) {
      if (!p.alive || p.id === b.ownerId || b.hit.has(p.id)) continue;
      if (b.ownerId === 'boss' && p.shield > Date.now()) {
        b.hit.add(p.id);
        if (b.pierce > 0) b.pierce--; else { bullets.splice(i, 1); removed = true; break; }
        continue;
      }
      if (Math.hypot(p.x - b.x, p.y - b.y) < PLAYER_RADIUS + b.size) {
        if (p.shield > Date.now()) {
          b.hit.add(p.id);
          if (b.pierce > 0) b.pierce--; else { bullets.splice(i, 1); removed = true; break; }
          continue;
        }
        p.hp -= b.damage;
        b.hit.add(p.id);
        if (p.hp <= 0) {
          const killer = b.ownerId === 'boss' ? null : players.get(b.ownerId);
          killPlayer(p, killer);
        }
        if (b.pierce > 0) b.pierce--;
        else { bullets.splice(i, 1); removed = true; break; }
      }
    }
    if (removed) continue;
  }

  // Гранаты
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.x += g.vx; g.y += g.vy;
    g.vx *= 0.95; g.vy *= 0.95;
    g.x = Math.max(10, Math.min(ARENA_W - 10, g.x));
    g.y = Math.max(10, Math.min(ARENA_H - 10, g.y));

    if (now >= g.detonateAt) {
      // Взрыв
      io.emit('explosion', { x: g.x, y: g.y, radius: g.radius });
      // Урон боссу
      if (boss && Math.hypot(boss.x - g.x, boss.y - g.y) < g.radius + boss.radius) {
        boss.hp -= g.damage;
        io.emit('bossHit', { hp: boss.hp, maxHp: boss.maxHp });
      }
      // Урон игрокам
      for (const p of players.values()) {
        if (!p.alive || p.id === g.ownerId) continue;
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < g.radius + PLAYER_RADIUS) {
          if (p.shield > now) continue;
          const dmg = g.damage * (1 - d / (g.radius + PLAYER_RADIUS));
          p.hp -= dmg;
          if (p.hp <= 0) killPlayer(p, players.get(g.ownerId));
        }
      }
      grenades.splice(i, 1);
    }
  }

  // Босс
  if (roundState === 'boss') updateBoss(now);

  // Дроп карточек
  if (roundState === 'playing' && now - lastCardDrop > PICKUP_INTERVAL) {
    spawnCard();
    lastCardDrop = now;
  }

  // Подбор карточек
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    for (const p of players.values()) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < PLAYER_RADIUS + 22) {
        c.apply(p);
        const stats = getStats(p.name);
        stats.xp += 25;
        io.emit('cardPicked', { player: p.name, card: c.name, playerId: p.id });
        cards.splice(i, 1);
        break;
      }
    }
  }
}

function spawnCard() {
  if (cards.length >= MAX_CARDS) return;
  let tries = 0, x, y;
  do {
    x = 60 + Math.random() * (ARENA_W - 120);
    y = 60 + Math.random() * (ARENA_H - 120);
    tries++;
  } while (collidesWalls(x, y, 25) && tries < 20);
  const card = UPGRADE_CARDS[Math.floor(Math.random() * UPGRADE_CARDS.length)];
  cards.push({ id: Math.random().toString(36).slice(2), ...card, x, y });
}

// ============ BROADCAST ============
function broadcastState() {
  const now = Date.now();
  const state = {
    round: roundNumber,
    state: roundState,
    map: currentMap.name,
    walls: currentMap.walls,
    timeLeft: 0,
    players: [...players.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle,
      hp: p.hp, maxHp: p.maxHp, alive: p.alive, kills: p.kills,
      shield: p.shield > now,
      dashCd: Math.max(0, (p.dashCd - now) / 1000),
      shieldCd: Math.max(0, (p.shieldCd - now) / 1000),
      grenadeCd: Math.max(0, (p.grenadeCd - now) / 1000),
    })),
    bullets: bullets.map(b => ({ x: b.x, y: b.y, size: b.size, ownerId: b.ownerId, isBoss: !!b.isBoss })),
    cards: cards.map(c => ({ id: c.id, x: c.x, y: c.y, name: c.name, color: c.color })),
    grenades: grenades.map(g => ({ x: g.x, y: g.y, t: (g.detonateAt - now) / 1200 })),
    boss: boss ? { x: boss.x, y: boss.y, hp: boss.hp, maxHp: boss.maxHp, radius: boss.radius, angle: boss.angle } : null,
  };
  if (roundState === 'playing' || roundState === 'boss') {
    state.timeLeft = Math.max(0,
      (roundState === 'playing' ? ROUND_TIME : BOSS_TIME) - (now - roundStartTime) / 1000
    );
  }
  io.emit('state', state);
}

// ============ CONNECTIONS ============
io.on('connection', (socket) => {
  const player = createPlayer(socket.id);
  players.set(socket.id, player);
  socket.emit('welcome', {
    id: socket.id,
    arena: { w: ARENA_W, h: ARENA_H },
    round: roundNumber,
    state: roundState,
    map: currentMap.name,
    walls: currentMap.walls,
  });

  if (players.size >= 1 && roundState === 'waiting') startRound();

  socket.on('setName', (name, cb) => {
    const clean = String(name).slice(0, 16).trim() || player.name;
    player.name = clean;
    const stats = getStats(clean);
    const rank = getRank(stats.xp);
    if (cb) cb({ name: clean, xp: stats.xp, rank: rank.name, wins: stats.wins });
  });

  socket.on('input', (data) => {
    if (data.keys) player.keys = data.keys;
    if (data.mouse) {
      player.mouse.x = data.mouse.x;
      player.mouse.y = data.mouse.y;
      player.mouse.down = data.mouse.down;
      player.angle = Math.atan2(data.mouse.y - player.y, data.mouse.x - player.x);
    }
  });

  socket.on('ability', (type) => {
    if (type === 'dash') useDash(player);
    else if (type === 'shield') useShield(player);
    else if (type === 'grenade') useGrenade(player);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    if (players.size === 0 && roundState !== 'waiting') {
      roundState = 'waiting';
    }
  });
});

// ============ GAME LOOP ============
setInterval(() => {
  update();
  broadcastState();
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Round Shooter v2 запущен на порту ${PORT}`);
});