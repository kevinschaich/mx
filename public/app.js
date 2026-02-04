const socket = io();
const w = { jog: wheel(), scroll: wheel() };
let cfg = { friction: 50, sensitivity: 50 }, f = 50, s = 50, log = [];

function wheel() { return { pos: 0, vel: 0, total: 0, high: 0, lastIn: 0, anim: null, input: 0, inputTime: 0 }; }

// Socket
socket.on('connect', () => console.log('✅'));
socket.on('config', d => { 
  cfg = d; f = d.friction ?? 50; s = d.sensitivity ?? 50; 
  el('friction').value = f; el('sensitivity').value = s; 
  el('frictionVal').textContent = f; el('sensitivityVal').textContent = s; 
});
socket.on('status', d => { 
  el('dot').classList.toggle('on', d.connected); 
  el('status').textContent = d.connected ? 'Connected' : 'Disconnected';
});
socket.on('report', r => r.events.forEach(e => {
  if (e.type === 'scroll') process(e.name === 'Jog' ? 'jog' : 'scroll', e);
  addLog(r.timestamp, e);
}));

// Process
function process(type, e) {
  const wh = w[type];
  wh.lastIn = Date.now();
  const speed = e.amount, dir = e.direction === 'up' ? 1 : -1, target = speed * 2.5 * dir;
  wh.vel += (target - wh.vel) * Math.min(0.5, 0.2 / Math.max(0.1, f / 50));
  wh.total++; if (speed > wh.high) wh.high = speed;
  wh.input = target; wh.inputTime = Date.now();
  update(type);
  if (!wh.anim) wh.anim = requestAnimationFrame(() => animate(type));
}

// Animate
function animate(type) {
  const wh = w[type], now = Date.now();
  if (Math.abs(wh.vel) < 0.1) { wh.vel = 0; wh.anim = null; update(type); return; }
  if (now - wh.lastIn > 50) wh.vel *= Math.max(0.8, Math.min(0.99, 1 - (0.08 * Math.max(0.1, f / 50))));
  wh.pos += wh.vel * (s / 50);
  update(type);
  wh.anim = requestAnimationFrame(() => animate(type));
}

// Update
function update(type) {
  const wh = w[type];
  el(`${type}Pos`).textContent = Math.round(wh.pos);
  el(`${type}Total`).textContent = wh.total;
  el(`${type}High`).textContent = wh.high;
  el(`${type}Circle`).style.strokeDashoffset = 314 - (((wh.pos % 360) + 360) % 360 / 360) * 314;
  draw(type);
}

// Draw
function draw(type) {
  const c = el(`${type}Canvas`), ctx = c.getContext('2d'), wh = w[type];
  ctx.clearRect(0, 0, 200, 120);
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, 60); ctx.lineTo(190, 60); ctx.stroke();
  
  const inp = Date.now() - wh.inputTime < 200 ? wh.input : 0;
  bar(ctx, 60, 60, inp, '#f59e0b');
  bar(ctx, 140, 60, wh.vel, type === 'jog' ? '#6366f1' : '#10b981');
  
  el(`${type}Input`).textContent = Math.round(Math.abs(inp));
  el(`${type}Vel`).textContent = Math.round(Math.abs(wh.vel));
  el(`${type}Mult`).textContent = Math.abs(inp) > 1 && Math.abs(wh.vel) > 1 
    ? (Math.abs(wh.vel) / Math.abs(inp)).toFixed(1) + 'x' : '—';
}

function bar(ctx, x, cy, v, col) {
  const h = (Math.abs(v) / 100) * 40, y = v >= 0 ? cy - h : cy;
  ctx.fillStyle = col; ctx.fillRect(x - 15, y, 30, Math.abs(h));
  ctx.strokeStyle = col; ctx.strokeRect(x - 15, y, 30, Math.abs(h));
}

// Log
function addLog(ts, e) {
  const t = new Date(ts).toLocaleTimeString();
  let m = '';
  if (e.type === 'button') m = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-600">${e.name}</span> ${e.action}`;
  else if (e.type === 'scroll') m = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-600">${e.name}</span> ${e.direction} ${e.amount}`;
  log.unshift(`<div class="text-zinc-500"><span class="text-zinc-600">${t}</span> ${m}</div>`);
  log = log.slice(0, 50); el('log').innerHTML = log.join('');
}

// Controls
window.set = (k, v) => {
  const val = Math.round(v);
  if (k === 'friction') { f = cfg.friction = val; el('frictionVal').textContent = val; }
  else { s = cfg.sensitivity = val; el('sensitivityVal').textContent = val; }
  fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friction: f, sensitivity: s }) });
};

window.reset = type => {
  const wh = w[type]; if (wh.anim) cancelAnimationFrame(wh.anim);
  Object.assign(wh, wheel()); update(type);
  toast(`🔄 ${type} reset`);
};

window.clearLog = () => { log = []; el('log').innerHTML = ''; };

function toast(m) {
  const d = document.createElement('div');
  d.className = 'toast fixed top-5 right-5 bg-zinc-800 border border-zinc-700 px-5 py-3 rounded font-semibold z-50';
  d.textContent = m; document.body.appendChild(d);
  setTimeout(() => d.remove(), 2000);
}

function el(id) { return document.getElementById(id); }

fetch('/api/config').then(r => r.json()).then(d => socket.emit('config', d)).catch(() => {});
