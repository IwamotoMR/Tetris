const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

const CONFIG = {
    WORLD_WIDTH: 5000,
    WORLD_HEIGHT: 5000,
    FOOD_COUNT: 400,
    BOT_COUNT: 12,
    START_MASS: 20,
    FOOD_MASS: 2,
    SPLIT_MIN_MASS: 40,
    EJECT_MASS: 14,
    MERGE_TIME: 12000
};

const players = new Map();
const bots = new Map();
const food = new Map();
let nextId = 1;

class Player {
    constructor(id, name, color, isBot = false) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.isBot = isBot;
        this.cells = [{
            x: Math.random() * CONFIG.WORLD_WIDTH,
            y: Math.random() * CONFIG.WORLD_HEIGHT,
            mass: CONFIG.START_MASS,
            vx: 0,
            vy: 0,
            splitTime: 0
        }];
        this.targetX = CONFIG.WORLD_WIDTH / 2;
        this.targetY = CONFIG.WORLD_HEIGHT / 2;
    }

    get totalMass() {
        return this.cells.reduce((sum, c) => sum + c.mass, 0);
    }

    update() {
        if (this.cells.length === 0) return;
        const main = this.cells[0];
        const speed = Math.max(2, 10 - this.totalMass / 500);
        const dx = this.targetX - main.x;
        const dy = this.targetY - main.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            main.vx = (dx / dist) * speed;
            main.vy = (dy / dist) * speed;
        }
        this.cells.forEach(cell => {
            cell.x += cell.vx;
            cell.y += cell.vy;
            const r = Math.sqrt(cell.mass / Math.PI) * 5;
            cell.x = Math.max(r, Math.min(CONFIG.WORLD_WIDTH - r, cell.x));
            cell.y = Math.max(r, Math.min(CONFIG.WORLD_HEIGHT - r, cell.y));
            cell.vx *= 0.9;
            cell.vy *= 0.9;
        });
    }

    split() {
        if (this.cells.length >= 8) return;
        const newCells = [];
        this.cells.forEach(cell => {
            if (cell.mass >= CONFIG.SPLIT_MIN_MASS && this.cells.length + newCells.length < 8) {
                const halfMass = cell.mass / 2;
                cell.mass = halfMass;
                const dx = this.targetX - cell.x;
                const dy = this.targetY - cell.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                newCells.push({
                    x: cell.x + (dx / dist) * 50,
                    y: cell.y + (dy / dist) * 50,
                    mass: halfMass,
                    vx: (dx / dist) * 20,
                    vy: (dy / dist) * 20,
                    splitTime: Date.now()
                });
            }
        });
        this.cells.push(...newCells);
    }

    ejectMass() {
        const main = this.cells[0];
        if (main.mass < CONFIG.EJECT_MASS * 2) return null;
        main.mass -= CONFIG.EJECT_MASS;
        const dx = this.targetX - main.x;
        const dy = this.targetY - main.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return {
            x: main.x + (dx / dist) * Math.sqrt(main.mass / Math.PI) * 5,
            y: main.y + (dy / dist) * Math.sqrt(main.mass / Math.PI) * 5,
            mass: CONFIG.EJECT_MASS,
            vx: (dx / dist) * 15,
            vy: (dy / dist) * 15
        };
    }
}

function createFood() {
    const id = nextId++;
    food.set(id, {
        id,
        x: Math.random() * CONFIG.WORLD_WIDTH,
        y: Math.random() * CONFIG.WORLD_HEIGHT,
        mass: CONFIG.FOOD_MASS,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`
    });
}

function createBot() {
    const id = 'bot_' + (nextId++);
    const bot = new Player(id, '', `hsl(${Math.random() * 360}, 70%, 60%)`, true);
    bots.set(id, bot);
}

function updateBotAI(bot) {
    if (bot.cells.length === 0) return;
    const main = bot.cells[0];
    let nearestFood = null;
    let nearestFoodDist = Infinity;
    food.forEach(f => {
        const d = Math.hypot(f.x - main.x, f.y - main.y);
        if (d < nearestFoodDist && d < 500) {
            nearestFoodDist = d;
            nearestFood = f;
        }
    });
    let target = null;
    let targetDist = Infinity;
    let flee = false;
    players.forEach(p => {
        if (p.cells.length === 0) return;
        const pc = p.cells[0];
        const d = Math.hypot(pc.x - main.x, pc.y - main.y);
        if (d < 600) {
            if (p.totalMass > bot.totalMass * 1.2) {
                flee = true;
                target = p;
                targetDist = d;
            } else if (bot.totalMass > p.totalMass * 1.2 && d < targetDist) {
                target = p;
                targetDist = d;
            }
        }
    });
    if (flee && target) {
        const pc = target.cells[0];
        bot.targetX = main.x - (pc.x - main.x);
        bot.targetY = main.y - (pc.y - main.y);
    } else if (nearestFood) {
        bot.targetX = nearestFood.x;
        bot.targetY = nearestFood.y;
    } else {
        if (Math.random() < 0.02) {
            bot.targetX = Math.random() * CONFIG.WORLD_WIDTH;
            bot.targetY = Math.random() * CONFIG.WORLD_HEIGHT;
        }
    }
}

function checkCollisions() {
    const allPlayers = [...players.values(), ...bots.values()];
    allPlayers.forEach(p => {
        p.cells.forEach(cell => {
            const r = Math.sqrt(cell.mass / Math.PI) * 5;
            food.forEach((f, fId) => {
                if (Math.hypot(f.x - cell.x, f.y - cell.y) < r) {
                    cell.mass += f.mass;
                    food.delete(fId);
                    createFood();
                }
            });
        });
    });
    for (let i = 0; i < allPlayers.length; i++) {
        for (let j = i + 1; j < allPlayers.length; j++) {
            const p1 = allPlayers[i];
            const p2 = allPlayers[j];
            if (p1.cells.length === 0 || p2.cells.length === 0) continue;
            const c1 = p1.cells[0];
            const c2 = p2.cells[0];
            const r1 = Math.sqrt(c1.mass / Math.PI) * 5;
            const r2 = Math.sqrt(c2.mass / Math.PI) * 5;
            const dist = Math.hypot(c2.x - c1.x, c2.y - c1.y);
            if (c1.mass > c2.mass * 1.2 && dist < r1) {
                c1.mass += c2.mass;
                p2.cells = [];
            } else if (c2.mass > c1.mass * 1.2 && dist < r2) {
                c2.mass += c1.mass;
                p1.cells = [];
            }
        }
    }
}

function broadcastState() {
    const list = [];
    players.forEach(p => {
        if (p.cells.length > 0) {
            list.push({
                id: p.id,
                name: p.name,
                color: p.color,
                mass: p.totalMass,
                x: p.cells[0].x,
                y: p.cells[0].y,
                isBot: false
            });
        }
    });
    bots.forEach(b => {
        if (b.cells.length > 0) {
            list.push({
                id: b.id,
                name: '',
                color: b.color,
                mass: b.totalMass,
                x: b.cells[0].x,
                y: b.cells[0].y,
                isBot: true
            });
        }
    });
    const leaderboard = list
        .sort((a, b) => b.mass - a.mass)
        .slice(0, 10)
        .map((p, i) => ({
            rank: i + 1,
            name: p.name || 'БОТ',
            mass: Math.floor(p.mass)
        }));
    io.emit('state', {
        players: list,
        food: Array.from(food.values()),
        leaderboard,
        total: list.length
    });
}

io.on('connection', (socket) => {
    console.log('✅ Подключился:', socket.id);
    socket.on('join', (data) => {
        const player = new Player(socket.id, data.name || 'Игрок', data.color || '#00ffff');
        players.set(socket.id, player);
        console.log(`🎮 ${data.name} зашёл в игру`);
    });
    socket.on('move', (data) => {
        const p = players.get(socket.id);
        if (p && p.cells.length > 0) {
            p.targetX = data.x;
            p.targetY = data.y;
        }
    });
    socket.on('split', () => {
        const p = players.get(socket.id);
        if (p) p.split();
    });
    socket.on('eject', () => {
        const p = players.get(socket.id);
        if (p) {
            const ejected = p.ejectMass();
            if (ejected) {
                const id = nextId++;
                food.set(id, { ...ejected, id });
            }
        }
    });
    socket.on('disconnect', () => {
        players.delete(socket.id);
        console.log('❌ Отключился:', socket.id);
    });
});

function gameLoop() {
    bots.forEach(bot => {
        if (bot.cells.length === 0) {
            bots.delete(bot.id);
            createBot();
        } else {
            updateBotAI(bot);
            bot.update();
        }
    });
    players.forEach(p => p.update());
    checkCollisions();
    broadcastState();
}

for (let i = 0; i < CONFIG.FOOD_COUNT; i++) createFood();
for (let i = 0; i < CONFIG.BOT_COUNT; i++) createBot();

setInterval(gameLoop, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 СЕРВЕР ЗАПУЩЕН!`);
    console.log(`🌐 Открой в браузере: http://localhost:${PORT}\n`);
});