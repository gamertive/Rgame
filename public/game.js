const socket = io();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const settingsEl = document.getElementById('settings');
const nameInput = document.getElementById('nameInput');
const playBtn = document.getElementById('playBtn');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettings = document.getElementById('closeSettings');

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

let myId = null;
let state = null;
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let myUpgrades = [];
let particles = [];
let myRank = { name: '🥉 Bronze', xp: 0 };
let currentWalls = [];
let screenShake = 0;

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

settingsBtn.onclick = () => { settingsEl.classList.remove('hidden'); menu.classList.add('hidden'); };
closeSettings.onclick = () => { settingsEl.classList.add('hidden'); menu.classList.remove('hidden'); };
['musicVol','sfxVol','sensitivity'].forEach(id => {
  document.getElementById(id).oninput = (e) => {
    Settings.set(id, +e.target.value);
    applySettings();
  };
});
document.getElementById('particles').onchange = (e) => Settings.set('particles', e.target.checked);
document.getElementById('musicOn').onchange = (e) => { Settings.set('musicOn', e.target.checked); applySettings(); };

// ============ МЕНЮ ============
playBtn.onclick = () => {
  Sounds.init();
  Sounds.startMusic();
  const name = nameInput.value.trim() || 'Player';
  socket.emit('setName', name, (res) => {
    myRank = { name: res.rank, xp: res.xp };
    updateRankUI();
  });
  menu.classList.add('hidden');
  applySettings();
};

// ============ ВВОД ============
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'q') { socket.emit('ability', 'dash'); Sounds.dash(); }
  if (k === 'e') { socket.emit('ability', 'shield'); Sounds.shield(); }
  if (k === 'f' || k === 'а') { socket.emit('ability', 'grenade'); }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const sens = Settings.get('sensitivity') / 100;
  mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { mouse.down = true; Sounds.init(); }
});
canvas.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ============ SOCKET ============
socket.on('welcome', (data) => {
  myId = data.id;
  currentWalls = data.walls || [];
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
  Sounds[data.alive ? 'roundStart' : 'kill']();
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
  // Прогресс до следующего ранга
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
      ctx.fillText(c.name.split('