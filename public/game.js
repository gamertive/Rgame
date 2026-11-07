// ============ ИНИЦИАЛИЗАЦИЯ ============
const socket = io();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ВАЖНО: сразу фокусируем canvas чтобы клавиатура работала
canvas.focus();

const menu = document.getElementById('menu');
const settingsEl = document.getElementById('settings');
const nameInput = document.getElementById('nameInput');
const playBtn = document.getElementById('playBtn');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettings = document.getElementById('closeSettings');
const connectionStatus = document.getElementById('connectionStatus');

const roundNumEl = document.getElementById('roundNum');
const timeLeftEl = document.getElementById('timeLeft');
const mapNameEl = document.getElementById('mapName');
const hpFill = document.getElementById('hpFill');
const hpText = document.getElementById('hpText');
const upgradesEl = document.getElementById('upgrades');
const leaderboardEl = document.getElementById('leaderboard');
const eventsEl = document.getElementById('events');
const roundEndEl = document.getElementById('roundEnd');
const endTitle = document.getElementById('endTitle');
const finalBoard = document.getElementById('finalBoard');
const endSub = document.getElementById('endSub');
const bossHud = document.getElementById('bossHud');
const bossHpFill = document.getElementById('bossHpFill');
const bossHpText = document.getElementById('bossHpText');
const rankNameEl = document.getElementById('rankName');
const xpFill = document.getElementById('xpFill');
const xpTextEl = document.getElementById('xpText');

const abDash = document.getElementById('abDash');
const abShield = document.getElementById('abShield');
const abGrenade = document.getElementById('abGrenade');

// ============ СОСТОЯНИЕ ============
let myId = null;
let state = null;
let keys = {};
let mouse = { x: 600, y: 350, down: false };
let myUpgrades = [];
let particles = [];
let myRank = { name: '🥉 Bronze', xp: 0 };
let currentWalls = [];
let screenShake = 0;
let gameStarted = false;

console.log('🎮 Клиент запущен, подключение к серверу...');

// ============ СТАТУС ПОДКЛЮЧЕНИЯ ============
socket.on('connect', () => {
  console.log('✅ Подключено к серверу! ID:', socket.id);
  connectionStatus.textContent = '✅ Подключено!';
  connectionStatus.style.color = '#2ecc71';
});

socket.on('disconnect', () => {
  console.log('❌ Отключено от сервера');
  connectionStatus.textContent = '❌ Соединение потеряно';
  connectionStatus.style.color = '#e74c3c';
});

socket.on('connect_error', (err) => {
  console.error('⚠ Ошибка подключения:', err.message);
  connectionStatus.textContent = '⚠ Ошибка: ' + err.message;
  connectionStatus.style.color = '#f39c12';
});

// ============ НАСТРОЙКИ UI ============
function applySettings() {
  document.getElementById('musicVol').value = Settings.get('musicVol');
  document.getElementById('sfxVol').value = Settings.get('sfxVol');
  document.getElementById('sensitivity').value = Settings.get('sensitivity');
  document.getElementById('particles').checked = Settings.get('particles');
  document.getElementById('musicOn').checked = Settings.get('musicOn');
  Sounds.setMusicVolume(Settings.get('musicVol') / 100);
  Sounds.setSfxVolume(Settings.get('sfxVol') / 100);
  Sounds.setMusicEnabled(Settings.get('musicOn'));
}

// ВАЖНО: используем addEventListener вместо onclick — надёжнее
settingsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('⚙ Открытие настроек');
  settingsEl.classList.remove('hidden');
  menu.classList.add('hidden');
});

closeSettings.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('✖ Закрытие настроек');
  settingsEl.classList.add('hidden');
  menu.classList.remove('hidden');
});

['musicVol','sfxVol','sensitivity'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    Settings.set(id, +e.target.value);
    applySettings();
  });
});
document.getElementById('particles').addEventListener('change', (e) => Settings.set('particles', e.target.checked));
document.getElementById('musicOn').addEventListener('change', (e) => {
  Settings.set('musicOn', e.target.checked);
  applySettings();
});

// ============ МЕНЮ — КНОПКА ИГРАТЬ ============
playBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('▶ Нажата кнопка ИГРАТЬ');

  // Инициализируем звук (требует пользовательского жеста)
  Sounds.init();
  Sounds.startMusic();

  const name = nameInput.value.trim() || 'Player';
  console.log('📝 Имя:', name);

  socket.emit('setName', name, (res) => {
    console.log('✅ Имя установлено:', res);
    myRank = { name: res.rank, xp: res.xp };
    updateRankUI();
  });

  menu.classList.add('hidden');
  gameStarted = true;

  // ВАЖНО: фокус на canvas чтобы клавиатура работала
  setTimeout(() => {
    canvas.focus();
    console.log('🎯 Фокус на canvas');
  }, 100);

  applySettings();
});

// ============ КЛАВИАТУРА ============
// ВАЖНО: слушаем на window, а не на canvas — работает всегда
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;

  // Предотвращаем прокрутку стрелками и пробелом
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) {
    e.preventDefault();
  }

  // Способности (только если игра началась)
  if (!gameStarted) return;

  if (k === 'q') {
    console.log('💨 Рывок!');
    socket.emit('ability', 'dash');
    Sounds.dash();
  }
  if (k === 'e' || k === 'у') {
    console.log('🛡️ Щит!');
    socket.emit('ability', 'shield');
    Sounds.shield();
  }
  if (k === 'f' || k === 'а') {
    console.log('💣 Граната!');
    socket.emit('ability', 'grenade');
  }
}, { passive: false });

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Возвращаем фокус на canvas при клике на него
canvas.addEventListener('click', () => {
  canvas.focus();
});

// ============ МЫШЬ ============
function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener('mousemove', (e) => {
  const pos = getMousePos(e);
  mouse.x = pos.x;
  mouse.y = pos.y;
});

// ВАЖНО: mousedown на canvas И на window для надёжности
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouse.down = true;
    Sounds.init(); // разблокируем AudioContext
    canvas.focus();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.down = false;
});

// Если мышь ушла за пределы canvas — отпускаем
canvas.addEventListener('mouseleave', () => {
  mouse.down = false;
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// ============ SOCKET СОБЫТИЯ ============
socket.on('welcome', (data) => {
  myId = data.id;
  currentWalls = data.walls || [];
  console.log('🎮 Добро пожаловать! ID:', myId);
});

socket.on('state', (s) => {
  state = s;
  currentWalls = s.walls || currentWalls;
  roundNumEl.textContent = s.round;
  timeLeftEl.textContent = Math.ceil(s.timeLeft);
  mapNameEl.textContent = s.map;
  updateHUD();
  updateBossHUD();
});

socket.on('roundStart', (data) => {
  myUpgrades = [];
  currentWalls = data.walls;
  showEvent(`🎯 РАУНД ${data.round} • ${data.map}`, '#4a90e2');
  roundEndEl.classList.add('hidden');
  bossHud.classList.add('hidden');
  Sounds.roundStart();
});

socket.on('bossStart', (data) => {
  bossHud.classList.remove('hidden');
  showEvent(`👹 БОСС ПОЯВИЛСЯ!`, '#e74c3c');
  Sounds.bossAppear();
});

socket.on('bossHit', (data) => {
  bossHpFill.style.width = (data.hp / data.maxHp * 100) + '%';
  bossHpText.textContent = `${Math.ceil(data.hp)} / ${data.maxHp}`;
  Sounds.bossHit();
});

socket.on('bossEnd', (data) => {
  bossHud.classList.add('hidden');
  roundEndEl.classList.remove('hidden');
  endTitle.textContent = data.alive ? '🏆 БОСС ПОВЕРЖЕН!' : '💀 БОСС ПОБЕДИЛ...';
  endTitle.style.color = data.alive ? '#2ecc71' : '#e74c3c';
  finalBoard.innerHTML = data.leaderboard.map((p, i) =>
    `<div class="final-row"><span>${i+1}. ${p.name}</span><span>${p.kills}💀</span></div>`
  ).join('');
  endSub.textContent = data.alive ? `+${data.reward} XP всем выжившим!` : 'Попробуйте снова в следующем раунде';
});

socket.on('roundEnd', (data) => {
  roundEndEl.classList.remove('hidden');
  endTitle.textContent = data.winner ? `🏆 Победил ${data.winner}!` : '⏰ Время вышло!';
  endTitle.style.color = '#4a90e2';
  finalBoard.innerHTML = data.leaderboard.map((p, i) =>
    `<div class="final-row"><span>${i+1}. ${p.name}</span><span>${p.kills}💀</span></div>`
  ).join('');
  endSub.textContent = `Следующий раунд через 5с...`;
});

socket.on('playerKilled', (data) => {
  showEvent(`💀 ${data.killer} → ${data.victim}`, '#e74c3c');
  Sounds.kill();
  if (state) {
    const v = state.players.find(p => p.name === data.victim);
    if (v && Settings.get('particles')) spawnExplosion(v.x, v.y, '#e74c3c');
  }
  screenShake = 10;
});

socket.on('cardPicked', (data) => {
  if (data.playerId === myId) {
    myUpgrades.push(data.card);
    showEvent(`✨ ${data.card}`, '#2ecc71');
    Sounds.pickup();
  }
});

socket.on('explosion', (data) => {
  Sounds.explosion();
  if (Settings.get('particles')) spawnExplosion(data.x, data.y, '#f39c12', 40);
  screenShake = 15;
});

socket.on('ability', (data) => {
  if (!Settings.get('particles')) return;
  if (data.type === 'dash') {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: data.x, y: data.y,
        vx: -Math.cos(data.angle) * (2 + Math.random()*3),
        vy: -Math.sin(data.angle) * (2 + Math.random()*3),
        life: 20, color: '#4a90e2', size: 3,
      });
    }
  }
});

// ============ UI ФУНКЦИИ ============
function showEvent(text, color) {
  const div = document.createElement('div');
  div.className = 'event-msg';
  div.style.color = color;
  div.textContent = text;
  eventsEl.appendChild(div);
  setTimeout(() => div.remove(), 2500);
}

function spawnExplosion(x, y, color, count = 20) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random()-0.5)*10,
      vy: (Math.random()-0.5)*10,
      life: 30, color, size: 2 + Math.random()*3,
    });
  }
}

function updateRankUI() {
  rankNameEl.textContent = myRank.name;
  xpTextEl.textContent = `${myRank.xp} XP`;
  const ranks = [
    { min: 0 }, { min: 500 }, { min: 1500 }, { min: 3000 },
    { min: 6000 }, { min: 10000 }, { min: 20000 }, { min: 50000 },
  ];
  let next = ranks.find(r => r.min > myRank.xp) || { min: myRank.xp + 1000 };
  let prev = [...ranks].reverse().find(r => r.min <= myRank.xp) || { min: 0 };
  const pct = ((myRank.xp - prev.min) / (next.min - prev.min)) * 100;
  xpFill.style.width = Math.min(100, pct) + '%';
}

function updateHUD() {
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  if (me) {
    const pct = Math.max(0, (me.hp / me.maxHp) * 100);
    hpFill.style.width = pct + '%';
    hpText.textContent = `${Math.ceil(me.hp)}/${me.maxHp}`;
    updateAbility(abDash, me.dashCd);
    updateAbility(abShield, me.shieldCd, me.shield);
    updateAbility(abGrenade, me.grenadeCd);
  }
  const sorted = [...state.players].sort((a,b) => b.kills - a.kills);
  leaderboardEl.innerHTML = '<h3>🏆 Лидеры</h3>' + sorted.slice(0,6).map((p,i) =>
    `<div class="lb-row ${p.id===myId?'me':''}"><span>${i+1}. ${p.name}</span><span>${p.kills}💀</span></div>`
  ).join('');
  upgradesEl.innerHTML = myUpgrades.map(u =>
    `<div class="upgrade-badge">${u}</div>`
  ).join('');
}

function updateAbility(el, cd, active = false) {
  const cdEl = el.querySelector('.ab-cd');
  if (active) {
    el.classList.add('on-cd');
    cdEl.textContent = '✓';
    cdEl.style.background = 'rgba(46,204,113,0.5)';
  } else if (cd > 0.1) {
    el.classList.add('on-cd');
    cdEl.textContent = Math.ceil(cd);
    cdEl.style.background = 'rgba(0,0,0,0.7)';
  } else {
    el.classList.remove('on-cd');
    cdEl.textContent = '';
  }
}

function updateBossHUD() {
  if (state?.boss) {
    bossHud.classList.remove('hidden');
    bossHpFill.style.width = (state.boss.hp / state.boss.maxHp * 100) + '%';
    bossHpText.textContent = `${Math.ceil(state.boss.hp)} / ${state.boss.maxHp}`;
  } else {
    bossHud.classList.add('hidden');
  }
}

// ============ РЕНДЕР ============
function render() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
    screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
  }

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Сетка
  ctx.strokeStyle = 'rgba(74,144,226,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }

  if (state) {
    // Стены
    for (const w of currentWalls) {
      const grad = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
      grad.addColorStop(0, '#34495e');
      grad.addColorStop(1, '#2c3e50');
      ctx.fillStyle = grad;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Карточки
    for (const c of state.cards) {
      const pulse = 1 + Math.sin(Date.now()/200)*0.1;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = c.color;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.name.split(' ')[0], 0, 0);
      ctx.restore();
    }

    // Гранаты
    for (const g of state.grenades) {
      ctx.fillStyle = g.t < 0.3 ? '#e74c3c' : '#f39c12';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Пули
    for (const b of state.bullets) {
      const isMine = b.ownerId === myId;
      ctx.fillStyle = b.isBoss ? '#e74c3c' : (isMine ? '#4a90e2' : '#f39c12');
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Игроки
    for (const p of state.players) {
      if (!p.alive) continue;
      const isMe = p.id === myId;
      if (p.shield) {
        ctx.strokeStyle = 'rgba(46,204,113,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 28, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.fillStyle = isMe ? '#4a90e2' : '#e74c3c';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Ствол
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle)*28, p.y + Math.sin(p.angle)*28);
      ctx.stroke();
      // HP
      const hpPct = p.hp / p.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(p.x - 22, p.y - 34, 44, 5);
      ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(p.x - 22, p.y - 34, 44 * hpPct, 5);
      // Имя
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y - 40);
    }

    // Босс
    if (state.boss) {
      const b = state.boss;
      ctx.save();
      ctx.translate(b.x, b.y);
      const aura = 1 + Math.sin(Date.now()/300)*0.1;
      ctx.fillStyle = 'rgba(231,76,60,0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 1.5 * aura, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.shadowColor = '#e74c3c';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(Math.cos(b.angle)*20, Math.sin(b.angle)*20, 15, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(Math.cos(b.angle)*25, Math.sin(b.angle)*25, 7, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Частицы
    if (Settings.get('particles')) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.94; p.vy *= 0.94;
        p.life--;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }
  }

  ctx.restore();
  requestAnimationFrame(render);
}

// ============ ОТПРАВКА ВВОДА НА СЕРВЕР ============
setInterval(() => {
  if (!gameStarted) return;
  socket.emit('input', { keys, mouse });
}, 1000 / 30);

// ============ ЗАПУСК ============
applySettings();
render();
console.log('🎮 Игра готова! Нажми ИГРАТЬ чтобы начать.');