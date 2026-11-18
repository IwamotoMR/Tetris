const socket = io();

const WORLD = 5000;

let state = { players: [], food: [], leaderboard: [], total: 0 };
let myName = '';
let myColor = '#00ffff';
let cam = { x: WORLD/2, y: WORLD/2, zoom: 1 };
let mouse = { x: 0, y: 0 };

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const mapCv = document.getElementById('mapCv');
const mapCtx = mapCv.getContext('2d');

function resize() {
    cv.width = innerWidth;
    cv.height = innerHeight;
}
resize();
addEventListener('resize', resize);

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const menu = document.getElementById('menu');
const game = document.getElementById('game');
const dead = document.getElementById('dead');

let selColor = '#00ffff';
document.querySelectorAll('.color').forEach(el => {
    el.onclick = () => {
        document.querySelectorAll('.color').forEach(e => e.classList.remove('sel'));
        el.classList.add('sel');
        selColor = el.dataset.c;
    };
});

document.getElementById('playBtn').onclick = startGame;
document.getElementById('againBtn').onclick = () => {
    dead.classList.add('hidden');
    game.classList.remove('hidden');
    socket.emit('join', { name: myName, color: myColor });
};

function startGame() {
    myName = document.getElementById('nick').value.trim() || 'Игрок';
    myColor = selColor;
    socket.emit('join', { name: myName, color: myColor });
    menu.classList.add('hidden');
    game.classList.remove('hidden');
    if (isMobile) document.getElementById('mbtn').classList.remove('hidden');
}

cv.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    sendMove();
});

cv.addEventListener('touchmove', e => {
    e.preventDefault();
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    sendMove();
}, { passive: false });

function sendMove() {
    const wx = (mouse.x - cv.width/2) / cam.zoom + cam.x;
    const wy = (mouse.y - cv.height/2) / cam.zoom + cam.y;
    socket.emit('move', { x: wx, y: wy });
}

addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); socket.emit('split'); }
    if (e.code === 'KeyW') socket.emit('eject');
});

if (isMobile) {
    document.getElementById('splitBtn').ontouchstart = e => { e.preventDefault(); socket.emit('split'); };
    document.getElementById('ejectBtn').ontouchstart = e => { e.preventDefault(); socket.emit('eject'); };

    let lastTap = 0;
    cv.addEventListener('touchstart', e => {
        const now = Date.now();
        if (now - lastTap < 300) socket.emit('split');
        lastTap = now;
    });
}

socket.on('state', s => {
    state = s;

    const lb = document.getElementById('lbList');
    lb.innerHTML = '';
    state.leaderboard.forEach(e => {
        const li = document.createElement('li');
        li.textContent = `#${e.rank} ${e.name} — ${e.mass}`;
        if (e.name === myName) li.style.color = '#ffff00';
        lb.appendChild(li);
    });

    const me = state.players.find(p => p.id === socket.id);
    document.getElementById('mass').textContent = me ? Math.floor(me.mass) : 0;
    document.getElementById('count').textContent = state.total;

    if (!me && !game.classList.contains('hidden')) {
        document.getElementById('finalMass').textContent = 0;
        game.classList.add('hidden');
        dead.classList.remove('hidden');
    }
});

function draw() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const me = state.players.find(p => p.id === socket.id);
    if (me) {
        cam.x = me.x;
        cam.y = me.y;
        cam.zoom = Math.max(0.3, 1 - me.mass / 5000);
    }

    ctx.save();
    ctx.translate(cv.width/2, cv.height/2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const gs = 100;
    const x1 = Math.floor((cam.x - cv.width/2/cam.zoom) / gs) * gs;
    const x2 = Math.ceil((cam.x + cv.width/2/cam.zoom) / gs) * gs;
    const y1 = Math.floor((cam.y - cv.height/2/cam.zoom) / gs) * gs;
    const y2 = Math.ceil((cam.y + cv.height/2/cam.zoom) / gs) * gs;
    for (let x = x1; x <= x2; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    }
    for (let y = y1; y <= y2; y += gs) {
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    }

    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 5;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff00ff';
    ctx.strokeRect(0, 0, WORLD, WORLD);
    ctx.shadowBlur = 0;

    state.food.forEach(f => {
        const r = Math.sqrt(f.mass / Math.PI) * 3;
        ctx.fillStyle = f.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;

    state.players.forEach(p => {
        const r = Math.sqrt(p.mass / Math.PI) * 5;
        const isMe = p.id === socket.id;

        ctx.fillStyle = p.color;
        ctx.shadowBlur = isMe ? 30 : 15;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = isMe ? 4 : 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (p.name) {
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.max(14, r/3)}px Courier New`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 4;
            ctx.fillText(p.name, p.x, p.y - 5);
            ctx.font = `${Math.max(11, r/4)}px Courier New`;
            ctx.fillText(Math.floor(p.mass), p.x, p.y + 12);
            ctx.shadowBlur = 0;
        }
    });

    ctx.restore();

    drawMap();

    requestAnimationFrame(draw);
}

function drawMap() {
    mapCtx.fillStyle = 'rgba(0,0,0,0.9)';
    mapCtx.fillRect(0, 0, 180, 180);

    mapCtx.strokeStyle = '#ff00ff';
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(0, 0, 180, 180);

    const sx = 180 / WORLD;
    const sy = 180 / WORLD;

    state.players.forEach(p => {
        mapCtx.fillStyle = p.id === socket.id ? '#fff' : p.color;
        mapCtx.beginPath();
        mapCtx.arc(p.x * sx, p.y * sy, p.id === socket.id ? 4 : 2, 0, Math.PI*2);
        mapCtx.fill();
    });
}

draw();