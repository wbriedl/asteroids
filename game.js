const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Responsive canvas
function resize() {
  canvas.width = Math.min(window.innerWidth - 4, 900);
  canvas.height = Math.min(window.innerHeight - 4, 700);
}
resize();
window.addEventListener('resize', resize);

// --- Constants ---
const SHIP_SIZE = 15;
const SHIP_TURN_SPEED = 3.5;     // degrees per frame
const SHIP_THRUST = 0.12;
const SHIP_FRICTION = 0.985;
const SHIP_INVINCIBLE_DURATION = 180; // frames
const BULLET_SPEED = 9;
const BULLET_MAX = 6;
const BULLET_LIFETIME = 55;
const ASTEROID_NUM_START = 4;
const ASTEROID_SPEED_BASE = 1.2;
const ASTEROID_VERT_NUM = 10;
const ASTEROID_JAG = 0.35;
const SCORE_LARGE = 20;
const SCORE_MEDIUM = 50;
const SCORE_SMALL = 100;
const LIVES_START = 3;

// --- Game State ---
let state = 'title'; // 'title' | 'playing' | 'gameover'
let score = 0;
let highScore = parseInt(localStorage.getItem('asteroidsHigh') || '0', 10);
if (!isFinite(highScore) || highScore < 0) highScore = 0;
let lives = LIVES_START;
let level = 1;
let ship, asteroids, bullets, particles;
let frameCount = 0;

// --- Input ---
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) startGame();
  if (state === 'gameover' && (e.code === 'Space' || e.code === 'Enter')) startGame();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// --- Classes ---
class Ship {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2; // pointing up
    this.thrusting = false;
    this.invincible = SHIP_INVINCIBLE_DURATION;
    this.alive = true;
    this.shootCooldown = 0;
    this.hyperspaceCooldown = 0;
    // Ship shape vertices (nose forward)
    this.nose   = { x: SHIP_SIZE, y: 0 };
    this.left   = { x: -SHIP_SIZE * 0.8, y: -SHIP_SIZE * 0.6 };
    this.right  = { x: -SHIP_SIZE * 0.8, y:  SHIP_SIZE * 0.6 };
    this.thrustL = { x: -SHIP_SIZE * 0.6, y: -SHIP_SIZE * 0.25 };
    this.thrustR = { x: -SHIP_SIZE * 0.6, y:  SHIP_SIZE * 0.25 };
  }

  update() {
    const W = canvas.width, H = canvas.height;
    if (keys['ArrowLeft']  || keys['KeyA']) this.angle -= SHIP_TURN_SPEED * Math.PI / 180;
    if (keys['ArrowRight'] || keys['KeyD']) this.angle += SHIP_TURN_SPEED * Math.PI / 180;

    this.thrusting = keys['ArrowUp'] || keys['KeyW'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * SHIP_THRUST;
      this.vy += Math.sin(this.angle) * SHIP_THRUST;
      // Thrust particles
      if (frameCount % 3 === 0) {
        const ex = this.x + Math.cos(this.angle + Math.PI) * SHIP_SIZE;
        const ey = this.y + Math.sin(this.angle + Math.PI) * SHIP_SIZE;
        particles.push(new Particle(ex, ey,
          Math.cos(this.angle + Math.PI) * (2 + Math.random() * 2) + this.vx * 0.5,
          Math.sin(this.angle + Math.PI) * (2 + Math.random() * 2) + this.vy * 0.5,
          0.7 + Math.random() * 0.3, '#ff9933', 12));
      }
    }

    // Hyperspace
    if ((keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyH']) && this.hyperspaceCooldown <= 0) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = 0; this.vy = 0;
      this.invincible = 60;
      this.hyperspaceCooldown = 120;
      spawnExplosion(this.x, this.y, '#fff', 20);
    }
    if (this.hyperspaceCooldown > 0) this.hyperspaceCooldown--;

    this.vx *= SHIP_FRICTION;
    this.vy *= SHIP_FRICTION;
    this.x += this.vx;
    this.y += this.vy;
    this.x = ((this.x % W) + W) % W;
    this.y = ((this.y % H) + H) % H;

    if (this.invincible > 0) this.invincible--;

    // Shoot
    if (this.shootCooldown > 0) this.shootCooldown--;
    if (keys['Space'] && this.shootCooldown <= 0 && bullets.length < BULLET_MAX) {
      const nx = this.x + Math.cos(this.angle) * SHIP_SIZE;
      const ny = this.y + Math.sin(this.angle) * SHIP_SIZE;
      bullets.push(new Bullet(nx, ny, this.angle, this.vx, this.vy));
      this.shootCooldown = 10;
      playSound('shoot');
    }
  }

  draw() {
    if (!this.alive) return;
    if (this.invincible > 0 && Math.floor(frameCount / 4) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#aaf';

    // Ship body
    ctx.beginPath();
    ctx.moveTo(this.nose.x, this.nose.y);
    ctx.lineTo(this.left.x, this.left.y);
    ctx.lineTo(this.thrustL.x, this.thrustL.y);
    ctx.lineTo(this.thrustR.x, this.thrustR.y);
    ctx.lineTo(this.right.x, this.right.y);
    ctx.closePath();
    ctx.stroke();

    // Thrust flame
    if (this.thrusting && frameCount % 4 < 3) {
      ctx.strokeStyle = '#f80';
      ctx.shadowColor = '#f80';
      ctx.beginPath();
      ctx.moveTo(this.thrustL.x, this.thrustL.y);
      ctx.lineTo(-SHIP_SIZE * 1.4, 0);
      ctx.lineTo(this.thrustR.x, this.thrustR.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  radius() { return SHIP_SIZE * 0.7; }
}

class Bullet {
  constructor(x, y, angle, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * BULLET_SPEED + vx * 0.5;
    this.vy = Math.sin(angle) * BULLET_SPEED + vy * 0.5;
    this.life = BULLET_LIFETIME;
    this.active = true;
  }

  update() {
    const W = canvas.width, H = canvas.height;
    this.x += this.vx;
    this.y += this.vy;
    this.x = ((this.x % W) + W) % W;
    this.y = ((this.y % H) + H) % H;
    this.life--;
    if (this.life <= 0) this.active = false;
  }

  draw() {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Asteroid {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size; // 3=large, 2=medium, 1=small
    this.radius = size * 18 + 5;
    const speed = (ASTEROID_SPEED_BASE + level * 0.1) / size;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed * (0.6 + Math.random());
    this.vy = Math.sin(angle) * speed * (0.6 + Math.random());
    this.angle = 0;
    this.rotSpeed = (Math.random() - 0.5) * 0.04;
    this.active = true;
    // Generate jagged shape
    this.verts = [];
    for (let i = 0; i < ASTEROID_VERT_NUM; i++) {
      const offset = 1 - ASTEROID_JAG / 2 + Math.random() * ASTEROID_JAG;
      this.verts.push(offset);
    }
  }

  update() {
    const W = canvas.width, H = canvas.height;
    this.x += this.vx;
    this.y += this.vy;
    this.angle += this.rotSpeed;
    this.x = ((this.x % W) + W) % W;
    this.y = ((this.y % H) + H) % H;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#8af';

    ctx.beginPath();
    for (let i = 0; i < ASTEROID_VERT_NUM; i++) {
      const a = (i / ASTEROID_VERT_NUM) * Math.PI * 2;
      const r = this.radius * this.verts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, vx, vy, size, color, life) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.size = size;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.active = true;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.97;
    this.vy *= 0.97;
    this.life--;
    if (this.life <= 0) this.active = false;
  }
  draw() {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 4;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Sound (Web Audio API) ---
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    const t = ac.currentTime;
    if (type === 'shoot') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t); osc.stop(t + 0.1);
    } else if (type === 'explode') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.4);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
    } else if (type === 'death') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.6);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t); osc.stop(t + 0.6);
    } else if (type === 'thrust') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80 + Math.random() * 20, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.start(t); osc.stop(t + 0.05);
    }
  } catch(e) {}
}

// Heartbeat pulse
let beatInterval = null;
let beatPhase = 0;
function startBeat() {
  if (beatInterval) return;
  beatInterval = setInterval(() => {
    if (state !== 'playing') { stopBeat(); return; }
    playBeat();
    beatPhase = 1 - beatPhase;
  }, Math.max(300, 900 - (asteroids ? asteroids.length : 0) * 40));
}
function stopBeat() {
  clearInterval(beatInterval);
  beatInterval = null;
}
function playBeat() {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    const t = ac.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(beatPhase === 0 ? 120 : 90, t);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t); osc.stop(t + 0.1);
  } catch(e) {}
}

// --- Helper ---
function spawnExplosion(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    particles.push(new Particle(x, y,
      Math.cos(angle) * speed, Math.sin(angle) * speed,
      1.5 + Math.random(), color, 20 + Math.random() * 30));
  }
}

function spawnAsteroids(num) {
  const W = canvas.width, H = canvas.height;
  for (let i = 0; i < num; i++) {
    let x, y;
    do {
      x = Math.random() * W;
      y = Math.random() * H;
    } while (Math.hypot(x - ship.x, y - ship.y) < 150);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// --- Game Init ---
function startGame() {
  stopBeat();
  score = 0;
  lives = LIVES_START;
  level = 1;
  state = 'playing';
  frameCount = 0;
  ship = new Ship(canvas.width / 2, canvas.height / 2);
  asteroids = [];
  bullets = [];
  particles = [];
  spawnAsteroids(ASTEROID_NUM_START);
  startBeat();
}

function nextLevel() {
  level++;
  bullets = [];
  particles = [];
  ship = new Ship(canvas.width / 2, canvas.height / 2);
  spawnAsteroids(ASTEROID_NUM_START + level - 1);
  startBeat();
}

function killShip() {
  playSound('death');
  spawnExplosion(ship.x, ship.y, '#fff', 40);
  lives--;
  if (lives <= 0) {
    ship.alive = false;
    state = 'gameover';
    stopBeat();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('asteroidsHigh', highScore);
    }
  } else {
    ship = new Ship(canvas.width / 2, canvas.height / 2);
  }
}

// --- Collision Detection ---
function checkCollisions() {
  // Bullets vs Asteroids
  for (let b = bullets.length - 1; b >= 0; b--) {
    for (let a = asteroids.length - 1; a >= 0; a--) {
      if (!bullets[b] || !bullets[b].active) break;
      if (dist(bullets[b], asteroids[a]) < asteroids[a].radius) {
        const ast = asteroids[a];
        // Score
        if (ast.size === 3) score += SCORE_LARGE;
        else if (ast.size === 2) score += SCORE_MEDIUM;
        else score += SCORE_SMALL;

        // Split
        if (ast.size > 1) {
          for (let s = 0; s < 2; s++)
            asteroids.push(new Asteroid(ast.x, ast.y, ast.size - 1));
        }
        spawnExplosion(ast.x, ast.y, '#8af', ast.size * 8);
        playSound('explode');

        asteroids.splice(a, 1);
        bullets[b].active = false;
        bullets.splice(b, 1);
        break;
      }
    }
  }

  // Ship vs Asteroids
  if (ship.alive && ship.invincible <= 0) {
    for (const ast of asteroids) {
      if (dist(ship, ast) < ast.radius + ship.radius()) {
        killShip();
        break;
      }
    }
  }
}

// --- Drawing ---
function drawHUD() {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#fff';
  ctx.font = 'bold 20px "Courier New", monospace';

  // Score
  ctx.textAlign = 'left';
  ctx.fillText(String(score).padStart(6, '0'), 20, 35);

  // High Score
  ctx.textAlign = 'center';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = '#aaa';
  ctx.shadowColor = '#aaa';
  ctx.fillText('HI ' + String(highScore).padStart(6, '0'), canvas.width / 2, 22);

  // Level
  ctx.textAlign = 'right';
  ctx.fillStyle = '#aaf';
  ctx.shadowColor = '#aaf';
  ctx.fillText('LEVEL ' + level, canvas.width - 20, 35);

  // Lives (draw mini ships)
  for (let i = 0; i < lives; i++) {
    ctx.save();
    ctx.translate(22 + i * 22, 60);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#fff';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-7, -5);
    ctx.lineTo(-5, -2);
    ctx.lineTo(-5, 2);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawTitleScreen() {
  const W = canvas.width, H = canvas.height;
  ctx.save();

  // Title
  ctx.textAlign = 'center';
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#fff';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 72px "Courier New", monospace';
  ctx.fillText('ASTEROIDS', W / 2, H / 2 - 80);

  // Subtitle
  ctx.font = '16px "Courier New", monospace';
  ctx.fillStyle = '#aaa';
  ctx.shadowColor = '#aaa';
  ctx.fillText('© 1979 ATARI INC. — BROWSER REMAKE', W / 2, H / 2 - 40);

  // Blink press space
  if (Math.floor(frameCount / 30) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.font = '20px "Courier New", monospace';
    ctx.fillText('PRESS SPACE / ENTER ZUM STARTEN', W / 2, H / 2 + 20);
  }

  // Controls
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = '#666';
  ctx.shadowBlur = 0;
  const controls = [
    ['↑  /  W', 'Schub'],
    ['← → / A D', 'Drehen'],
    ['LEERTASTE', 'Schießen'],
    ['SHIFT / H', 'Hyperspace'],
  ];
  controls.forEach((c, i) => {
    ctx.textAlign = 'right';
    ctx.fillText(c[0], W / 2 - 10, H / 2 + 80 + i * 22);
    ctx.textAlign = 'left';
    ctx.fillText(c[1], W / 2 + 10, H / 2 + 80 + i * 22);
  });

  // High score
  if (highScore > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9';
    ctx.shadowColor = '#ff9';
    ctx.shadowBlur = 8;
    ctx.font = '15px "Courier New", monospace';
    ctx.fillText('BESTPUNKTZAHL: ' + highScore, W / 2, H / 2 + 185);
  }

  ctx.restore();
}

function drawGameOver() {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.textAlign = 'center';

  ctx.shadowBlur = 20;
  ctx.shadowColor = '#f44';
  ctx.fillStyle = '#f44';
  ctx.font = 'bold 60px "Courier New", monospace';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 40);

  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.font = '20px "Courier New", monospace';
  ctx.fillText('PUNKTE: ' + score, W / 2, H / 2 + 10);

  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ff9';
    ctx.shadowColor = '#ff9';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText('NEUER HIGHSCORE!', W / 2, H / 2 + 40);
  }

  if (Math.floor(frameCount / 30) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('SPACE / ENTER — NOCHMAL SPIELEN', W / 2, H / 2 + 80);
  }
  ctx.restore();
}

function drawStarfield() {
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 80; i++) {
    const sx = Math.abs(Math.sin(i * 7.3 + 1.1) * canvas.width);
    const sy = Math.abs(Math.cos(i * 5.7 + 2.3) * canvas.height);
    const ss = Math.abs(Math.sin(i * 13.1)) * 1.2 + 0.3;
    ctx.beginPath();
    ctx.arc(sx, sy, ss, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Main Loop ---
function loop() {
  frameCount++;

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStarfield();

  if (state === 'title') {
    if (!asteroids) asteroids = [];
    if (asteroids.length === 0) {
      for (let i = 0; i < 6; i++) asteroids.push(new Asteroid(
        Math.random() * canvas.width, Math.random() * canvas.height, Math.ceil(Math.random() * 3)));
    }
    asteroids.forEach(a => { a.update(); a.draw(); });
    particles.forEach(p => { p.update(); p.draw(); });
    particles = particles.filter(p => p.active);
    drawTitleScreen();
  }

  if (state === 'playing') {
    ship.update();
    bullets.forEach(b => b.update());
    asteroids.forEach(a => a.update());
    particles.forEach(p => p.update());

    bullets = bullets.filter(b => b.active);
    particles = particles.filter(p => p.active);

    checkCollisions();

    if (asteroids.length === 0) nextLevel();

    asteroids.forEach(a => a.draw());
    bullets.forEach(b => b.draw());
    particles.forEach(p => p.draw());
    ship.draw();
    drawHUD();
  }

  if (state === 'gameover') {
    asteroids.forEach(a => { a.update(); a.draw(); });
    particles.forEach(p => { p.update(); p.draw(); });
    particles = particles.filter(p => p.active);
    drawGameOver();
  }

  requestAnimationFrame(loop);
}

// --- Init ---
particles = [];
asteroids = [];
loop();
