(function () {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');
  let W, H;

  const showPages = document.body.dataset.bgPages === 'true';

  // ── Constants ─────────────────────────────────────────────────────────────

  const SKY = [
    [0.00, [10, 20, 15]],
    [0.42, [22, 40, 30]],
    [0.72, [52, 34, 14]],
    [1.00, [72, 44, 16]],
  ];

  const HILL_DEFS = [
    { hFrac: 0.66, rate: 0.00025, amp: 0.090, rgb: [18, 48, 34] },
    { hFrac: 0.77, rate: 0.00050, amp: 0.065, rgb: [12, 37, 26] },
    { hFrac: 0.87, rate: 0.00090, amp: 0.045, rgb: [7,  26, 17] },
  ];

  const SIL = 'rgb(5,18,12)';

  // ── State ─────────────────────────────────────────────────────────────────

  const hills = HILL_DEFS.map(d => ({ ...d, phase: Math.random() * Math.PI * 2 }));

  const STARS = Array.from({ length: 85 }, () => ({
    xf: Math.random(), yf: Math.random() * 0.60,
    r:     Math.random() * 0.9 + 0.4,
    base:  Math.random() * 0.45 + 0.20,
    phase: Math.random() * Math.PI * 2,
    rate:  Math.random() * 0.022 + 0.007,
  }));

  function mkSmokeParticle(n, i, driftRange) {
    return { age: i / n, bx: undefined, by: undefined,
             drift: (Math.random() - 0.5) * driftRange,
             rate:  Math.random() * 0.0028 + 0.0018 };
  }
  const SMOKE      = Array.from({ length: 5 }, (_, i) => mkSmokeParticle(5, i, 22));
  const FIRE_SMOKE = Array.from({ length: 4 }, (_, i) => mkSmokeParticle(4, i, 14));

  // House magical height — lerps toward a random target
  let houseHS       = 1.0;
  let houseTargetHS = 1.0 + Math.random() * 4;
  let houseTimer    = 0;

  // Window lights — 28 slots (max 14 floors × 2 windows); randomly toggled
  const WIN_STATES = Array.from({ length: 28 }, () => Math.random() > 0.45);
  let winToggleTimer = 0;

  // Shooting star
  let shootingStar = null;

  // Fire flicker timer
  let fireT = 0;

  // Falling pages
  const PAGE_N = 28;
  let pages = [];

  function mkPage(atTop) {
    const pw = Math.random() * 22 + 16;
    const ph = pw * (1.28 + Math.random() * 0.22);
    return {
      x: (W || 800) * 0.25 + Math.random() * (W || 800) * 0.50,
      y: atTop ? Math.random() * (H || 600) : -(ph + Math.random() * 120),
      pw, ph,
      vy:     Math.random() * 0.55 + 0.28,
      ang:    (Math.random() - 0.5) * 0.65,
      spin:   (Math.random() - 0.5) * 0.006,
      sp:     Math.random() * Math.PI * 2,
      ss:     Math.random() * 0.016 + 0.007,
      sa:     Math.random() * 26 + 12,
      op:     Math.random() * 0.30 + 0.45,
      nLines: Math.floor(Math.random() * 3 + 2),
    };
  }

  let sceneT = 0;

  // ── Resize ────────────────────────────────────────────────────────────────

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  if (showPages) pages = Array.from({ length: PAGE_N }, () => mkPage(true));

  // ── Hill helpers ──────────────────────────────────────────────────────────

  function nearHillY(x) {
    const hl = hills[2];
    const t  = x / W;
    return H * hl.hFrac
      - Math.sin(t * Math.PI * 2.4 + hl.phase)       * H * hl.amp
      - Math.sin(t * Math.PI * 4.9 + hl.phase * 1.7) * H * hl.amp * 0.32
      - Math.sin(t * Math.PI * 1.2 + hl.phase * 0.6) * H * hl.amp * 0.52;
  }

  // ── Sky layer ─────────────────────────────────────────────────────────────

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [stop, [r, gv, b]] of SKY) g.addColorStop(stop, `rgb(${r},${gv},${b})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    for (const s of STARS) {
      s.phase += s.rate;
      const op = s.base * (0.65 + 0.35 * Math.sin(s.phase));
      ctx.beginPath();
      ctx.arc(s.xf * W, s.yf * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(228,218,196,${op.toFixed(3)})`;
      ctx.fill();
    }
  }

  function drawMoon() {
    const mx = W * 0.82, my = H * 0.10, mr = 22;
    ctx.shadowColor = 'rgba(220,210,175,0.50)';
    ctx.shadowBlur  = 26;
    ctx.fillStyle   = 'rgba(234,224,198,0.82)';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgb(13,25,19)';
    ctx.beginPath();
    ctx.arc(mx - 10, my - 1, mr * 0.84, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shooting star — spawns randomly, streaks across upper sky
  function tickShootingStar() {
    if (!shootingStar) {
      if (Math.random() < 0.0005) {
        const ang = 0.35 + Math.random() * 0.45;
        const spd = 10 + Math.random() * 8;
        shootingStar = {
          x: Math.random() * W * 0.55, y: Math.random() * H * 0.28,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          life: 1.0, trail: 80 + Math.random() * 70,
        };
      }
      return;
    }
    const s = shootingStar;
    s.x += s.vx; s.y += s.vy;
    s.life -= 0.028;
    if (s.life <= 0 || s.x > W || s.y > H * 0.65) { shootingStar = null; return; }

    const spd = Math.hypot(s.vx, s.vy);
    const tx  = s.x - (s.vx / spd) * s.trail;
    const ty  = s.y - (s.vy / spd) * s.trail;
    const g   = ctx.createLinearGradient(tx, ty, s.x, s.y);
    g.addColorStop(0, 'rgba(228,218,196,0)');
    g.addColorStop(1, `rgba(255,248,225,${(s.life * 0.92).toFixed(3)})`);
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y);
    ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5 * s.life, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,252,235,${s.life.toFixed(3)})`;
    ctx.fill();
  }

  // ── Terrain ───────────────────────────────────────────────────────────────

  function drawHills() {
    for (const hl of hills) {
      hl.phase += hl.rate;
      const baseY = H * hl.hFrac;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const y = baseY
          - Math.sin(t * Math.PI * 2.4 + hl.phase)       * H * hl.amp
          - Math.sin(t * Math.PI * 4.9 + hl.phase * 1.7) * H * hl.amp * 0.32
          - Math.sin(t * Math.PI * 1.2 + hl.phase * 0.6) * H * hl.amp * 0.52;
        ctx.lineTo(t * W, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      const [r, gv, b] = hl.rgb;
      ctx.fillStyle = `rgb(${r},${gv},${b})`;
      ctx.fill();
    }
  }

  function drawFog() {
    const fogY = H * 0.76, fogH = H * 0.09;
    const g    = ctx.createLinearGradient(0, fogY, 0, fogY + fogH);
    g.addColorStop(0,    'rgba(22,42,30,0)');
    g.addColorStop(0.35, 'rgba(22,42,30,0.13)');
    g.addColorStop(0.65, 'rgba(22,42,30,0.09)');
    g.addColorStop(1,    'rgba(22,42,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, fogY, W, fogH);
  }

  // ── Scene objects ─────────────────────────────────────────────────────────

  function drawPineTree(cx, gy, scale) {
    ctx.fillStyle = SIL;
    const h = 52 * scale, w = 13 * scale;
    ctx.fillRect(cx - 2.5 * scale, gy - h * 0.22, 5 * scale, h * 0.22);
    ctx.beginPath();
    ctx.moveTo(cx - w,        gy - h * 0.18);
    ctx.lineTo(cx + w,        gy - h * 0.18);
    ctx.lineTo(cx,            gy - h * 0.68);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.65, gy - h * 0.52);
    ctx.lineTo(cx + w * 0.65, gy - h * 0.52);
    ctx.lineTo(cx,            gy - h);
    ctx.closePath(); ctx.fill();
  }

  function drawRoundTree(cx, gy, scale) {
    ctx.fillStyle = SIL;
    const th = 28 * scale, tr = 3 * scale, cr = 15 * scale;
    ctx.fillRect(cx - tr, gy - th, tr * 2, th);
    ctx.beginPath();
    ctx.arc(cx, gy - th - cr * 0.65, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Static tower on the left side — battlements + conical roof + arrow slits
  function drawLeftTower(cx, gy) {
    const w  = 60, hw = 30;
    const hb = 360, hr = 105;
    const gyL = nearHillY(cx - hw);
    const gyR = nearHillY(cx + hw);

    ctx.fillStyle = SIL;

    // Body
    ctx.beginPath();
    ctx.moveTo(cx - hw, gyL);
    ctx.lineTo(cx - hw, gy - hb);
    ctx.lineTo(cx + hw, gy - hb);
    ctx.lineTo(cx + hw, gyR);
    ctx.closePath(); ctx.fill();

    // Battlements — 5 merlons, scaled to wider tower
    const bW = 8, bH = 14, bGap = 6;
    const bStart = cx - (5 * bW + 4 * bGap) / 2;
    for (let m = 0; m < 5; m++) {
      ctx.fillRect(bStart + m * (bW + bGap), gy - hb - bH, bW, bH);
    }

    // Conical roof (inside battlements)
    ctx.beginPath();
    ctx.moveTo(cx - hw + 4, gy - hb);
    ctx.lineTo(cx + hw - 4, gy - hb);
    ctx.lineTo(cx, gy - hb - hr);
    ctx.closePath(); ctx.fill();

    // Arrow slit windows — evenly spaced up the full height
    const nSlits = 8;
    const slitStep = Math.floor(hb / (nSlits + 1));
    ctx.shadowColor = 'rgba(201,162,39,0.7)';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = 'rgba(201,162,39,0.38)';
    for (let i = 1; i <= nSlits; i++) {
      ctx.fillRect(cx - 3, gy - hb + i * slitStep, 5, 14);
    }
    ctx.shadowBlur = 0;
  }

  // House: only walls grow — roof/chimney are fixed caps so it feels like a building
  // rising, not a shape being stretched. Windows multiply as floors are added.
  function drawHouse(cx, gy, hs) {
    const w  = 68;       // fixed width
    const hb = 50 * hs;  // wall height grows
    const hr = 26;       // roof stays the same size always
    const hw = w / 2;
    const gyL = nearHillY(cx - hw);
    const gyR = nearHillY(cx + hw);

    ctx.fillStyle = SIL;
    // Walls — polygon so each side meets the hill slope
    ctx.beginPath();
    ctx.moveTo(cx - hw, gyL);
    ctx.lineTo(cx - hw, gy - hb);
    ctx.lineTo(cx + hw, gy - hb);
    ctx.lineTo(cx + hw, gyR);
    ctx.closePath(); ctx.fill();

    // Roof — fixed size cap, always the same house roof on top
    ctx.beginPath();
    ctx.moveTo(cx - hw - 5, gy - hb);
    ctx.lineTo(cx + hw + 5, gy - hb);
    ctx.lineTo(cx,           gy - hb - hr);
    ctx.closePath(); ctx.fill();

    // Chimney — fixed size, pokes through the fixed roof
    ctx.fillRect(cx + 10, gy - hb - hr + 6, 9, 24);

    // Windows — one centered double-pane window per floor, widely spaced
    const floorH  = 42;   // generous gap between floors
    const topPad  = 14;
    const winH    = 14;
    const winW    = 22;
    const nFloors = Math.max(1, Math.min(6, Math.floor((hb - topPad - 10) / floorH)));

    // Glow pass (with shadow)
    ctx.shadowColor = 'rgba(201,162,39,0.9)';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = 'rgba(201,162,39,0.55)';
    for (let f = 0; f < nFloors; f++) {
      if (!WIN_STATES[f]) continue;
      ctx.fillRect(cx - winW / 2, gy - hb + topPad + f * floorH, winW, winH);
    }
    ctx.shadowBlur = 0;

    // Pane divider pass — dark cross overlaid on each lit window
    ctx.fillStyle = SIL;
    for (let f = 0; f < nFloors; f++) {
      if (!WIN_STATES[f]) continue;
      const wy = gy - hb + topPad + f * floorH;
      ctx.fillRect(cx - 1,        wy,              2,    winH);  // vertical bar
      ctx.fillRect(cx - winW / 2, wy + winH / 2 - 1, winW, 2);  // horizontal bar
    }
  }

  // Generic smoke — works for chimney and campfire.
  // maxR: max particle radius, rise: pixels of upward travel, opMax: peak opacity.
  function drawSmokeCloud(parts, cx, cy, maxR, rise, opMax) {
    for (const s of parts) {
      if (s.bx === undefined) { s.bx = cx + (Math.random() - 0.5) * 3; s.by = cy; }
      s.age += s.rate;
      if (s.age >= 1) { s.age = 0; s.bx = cx + (Math.random() - 0.5) * 4; s.by = cy; }
      const r  = 1.5 + s.age * maxR;
      const op = opMax * (1 - s.age);
      ctx.beginPath();
      ctx.arc(s.bx + s.drift * s.age, s.by - s.age * rise, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,185,162,${op.toFixed(3)})`;
      ctx.fill();
    }
  }

  // Campfire — logs + two flame layers + ember glow
  function drawFire(cx, gy) {
    fireT += 0.09;

    // Rocky stone ring — each stone grounded to terrain at its own x position
    ctx.fillStyle = SIL;
    // [dx, width, height, variant] — variant alternates stone silhouette shape
    const stoneRing = [
      { dx: -20, w: 11, h:  9, v: 0 },
      { dx: -12, w:  9, h: 12, v: 1 },
      { dx:  -5, w:  8, h:  8, v: 0 },
      { dx:   4, w:  8, h:  9, v: 1 },
      { dx:  12, w:  9, h: 12, v: 0 },
      { dx:  20, w: 11, h:  8, v: 1 },
    ];
    for (const s of stoneRing) {
      const sx  = cx + s.dx;
      const sy  = nearHillY(sx);  // terrain at this stone's x
      const sb  = sy + 3;          // base 3 px below terrain — no gap on sloping hill
      const hw  = s.w * 0.5, h = s.h;
      ctx.beginPath();
      if (s.v === 0) {
        // Blocky stone — angular shoulder, flatter top
        ctx.moveTo(sx - hw * 0.55, sb);
        ctx.quadraticCurveTo(sx - hw * 1.05, sy - h * 0.35, sx - hw * 0.65, sy - h * 0.92);
        ctx.lineTo(sx - hw * 0.10, sy - h * 1.12);
        ctx.quadraticCurveTo(sx + hw * 0.30, sy - h * 1.22, sx + hw * 0.60, sy - h * 0.96);
        ctx.quadraticCurveTo(sx + hw * 1.05, sy - h * 0.45, sx + hw * 0.45, sb);
      } else {
        // Rounded stone — smooth hump
        ctx.moveTo(sx - hw * 0.60, sb);
        ctx.quadraticCurveTo(sx - hw * 1.10, sy - h * 0.50, sx - hw * 0.45, sy - h * 1.05);
        ctx.quadraticCurveTo(sx + hw * 0.05, sy - h * 1.28, sx + hw * 0.55, sy - h * 1.05);
        ctx.quadraticCurveTo(sx + hw * 1.10, sy - h * 0.55, sx + hw * 0.50, sb);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Inner fill — seals the center under the logs regardless of terrain slope
    const gyIL = nearHillY(cx - 10);
    const gyIR = nearHillY(cx + 10);
    ctx.beginPath();
    ctx.moveTo(cx - 10, gy - 4);
    ctx.lineTo(cx + 10, gy - 4);
    ctx.lineTo(cx + 10, gyIR + 1);
    ctx.lineTo(cx - 10, gyIL + 1);
    ctx.closePath();
    ctx.fill();

    // Logs
    ctx.fillStyle = SIL;
    ctx.save();
    ctx.translate(cx, gy - 3);
    ctx.rotate(0.3);
    ctx.fillRect(-10, -2, 20, 4);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, gy - 3);
    ctx.rotate(-0.3);
    ctx.fillRect(-10, -2, 20, 4);
    ctx.restore();

    // Outer flame
    const h1 = 20 + Math.sin(fireT * 1.3) * 4;
    const w1 =  7 + Math.sin(fireT * 0.9) * 2;
    const ox1 = Math.sin(fireT * 2.1) * 2;
    const g1  = ctx.createRadialGradient(cx + ox1, gy - h1, 0, cx, gy - 2, h1 + 4);
    g1.addColorStop(0,   'rgba(255,200,60,0.92)');
    g1.addColorStop(0.5, 'rgba(255,110,15,0.70)');
    g1.addColorStop(1,   'rgba(180,55,5,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.moveTo(cx - w1, gy - 2);
    ctx.quadraticCurveTo(cx - w1 * 1.3, gy - h1 * 0.55, cx + ox1, gy - h1);
    ctx.quadraticCurveTo(cx + w1 * 1.3, gy - h1 * 0.55, cx + w1, gy - 2);
    ctx.closePath(); ctx.fill();

    // Inner flame (hotter, brighter)
    const h2 = 13 + Math.sin(fireT * 1.8 + 1) * 3;
    const w2 =  4 + Math.sin(fireT * 1.2) * 1;
    const ox2 = Math.sin(fireT * 2.9) * 1.5;
    const g2  = ctx.createRadialGradient(cx + ox2, gy - h2, 0, cx, gy - 2, h2 + 2);
    g2.addColorStop(0,   'rgba(255,255,190,1.0)');
    g2.addColorStop(0.4, 'rgba(255,210,70,0.85)');
    g2.addColorStop(1,   'rgba(255,100,10,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(cx - w2, gy - 2);
    ctx.quadraticCurveTo(cx - w2, gy - h2 * 0.5, cx + ox2, gy - h2);
    ctx.quadraticCurveTo(cx + w2, gy - h2 * 0.5, cx + w2, gy - 2);
    ctx.closePath(); ctx.fill();

    // Ember ground glow
    ctx.shadowColor = 'rgba(255,120,20,0.7)';
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = 'rgba(255,140,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 1, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Witch — flies on broomstick near the tower, glowing spell-book floats ahead.
  function drawWitch(cx, gy) {
    ctx.fillStyle = SIL;

    // Broomstick handle — slight nose-up tilt
    ctx.save();
    ctx.translate(cx, gy);
    ctx.rotate(-0.09);
    ctx.fillRect(-26, -1.5, 52, 3);
    ctx.restore();

    // Bristles at tail end (right, behind flying direction)
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(cx + 24, gy - 1);
      ctx.rotate((i - 3) * 0.11 + 0.22);
      ctx.fillRect(0, -1, 13, 1.5);
      ctx.restore();
    }

    // Wind-blown robe — billows to the right
    ctx.fillStyle = 'rgb(4,14,9)';
    const sway   = Math.sin(sceneT * 0.038) * 4;
    const billow = Math.sin(sceneT * 0.038 + 1.1) * 3;
    ctx.beginPath();
    ctx.moveTo(cx - 2, gy - 21);
    ctx.lineTo(cx + 3, gy - 21);
    ctx.quadraticCurveTo(cx + 13 + billow, gy - 7, cx + 16 + sway, gy + 7);
    ctx.lineTo(cx + 3 + sway * 0.4, gy + 7);
    ctx.quadraticCurveTo(cx - 4 + billow, gy - 4, cx - 2, gy - 21);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(cx - 2, gy - 28, 5, 0, Math.PI * 2);
    ctx.fill();

    // Hat brim + tall cone
    ctx.fillRect(cx - 10, gy - 34, 16, 3);
    ctx.beginPath();
    ctx.moveTo(cx - 9, gy - 34);
    ctx.lineTo(cx + 5, gy - 34);
    ctx.lineTo(cx + 0, gy - 56);
    ctx.closePath();
    ctx.fill();

    // Legs straddling broom
    ctx.fillRect(cx - 7, gy + 1, 4, 12);
    ctx.fillRect(cx + 2, gy + 1, 4, 12);

    // Glowing spell-book
    ctx.shadowColor = 'rgba(130,185,255,0.9)';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = 'rgba(130,185,255,0.32)';
    ctx.fillRect(cx - 27, gy - 22, 10, 13);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = SIL;
    ctx.fillRect(cx - 23, gy - 22, 1.5, 13);
    ctx.fillStyle   = 'rgb(4,14,9)';
  }

  // Chair — low camp/folding chair, seat angled back, backrest reclined.
  function drawChair(cx, gy) {
    ctx.fillStyle = SIL;
    // Seat — tilted slightly rearward
    ctx.save();
    ctx.translate(cx, gy - 10);
    ctx.rotate(-0.18);
    ctx.fillRect(-11, 0, 24, 3);
    ctx.restore();
    // Backrest — reclined at ~120° from seat
    ctx.save();
    ctx.translate(cx + 11, gy - 10);
    ctx.rotate(0.52);
    ctx.fillRect(-1.5, -18, 3, 18);
    ctx.restore();
    // Short legs
    ctx.fillRect(cx - 10, gy - 9, 3, 9);
    ctx.fillRect(cx + 10, gy - 9, 3, 9);
  }

  // Sitter — reclined in low camp chair, raises one arm to fly the kite.
  // Arm tip ≈ (cx+1, gy-48) — must match kite string anchor below.
  function drawSitter(cx, gy) {
    ctx.fillStyle = 'rgb(4,14,9)';

    // Hip block — anchors figure on the seat, connects torso to legs
    ctx.fillRect(cx - 1, gy - 14, 14, 6);

    // Torso — wide rect leaning back into chair (11 px wide so it reads as a body)
    ctx.save();
    ctx.translate(cx + 7, gy - 14);
    ctx.rotate(0.44);
    ctx.fillRect(-5, -20, 11, 20);
    ctx.restore();

    // Head — sits right above torso top
    ctx.beginPath();
    ctx.arc(cx + 12, gy - 33, 6, 0, Math.PI * 2);
    ctx.fill();

    // Thighs stretching forward (left), lower legs hanging
    ctx.fillRect(cx - 15, gy - 14, 18, 5);
    ctx.fillRect(cx - 17, gy - 9, 5, 10);

    // Raised arm for kite — translate(cx+7, gy-29), rotate(-0.35), length 20
    // Tip: (cx+7)-20·sin(0.35) ≈ cx+1  |  (gy-29)-20·cos(0.35) ≈ gy-48
    ctx.save();
    ctx.translate(cx + 7, gy - 29);
    ctx.rotate(-0.35);
    ctx.fillRect(-2, -20, 4, 20);
    ctx.restore();
  }

  function drawScene() {
    sceneT++;

    const kiteX = W * 0.50 + Math.sin(sceneT * 0.014) * 10;
    const kiteY = H * 0.20 + Math.sin(sceneT * 0.023) * 10;

    const witchCX   = W * 0.12;
    const witchDrawY = nearHillY(witchCX) - 72 + Math.sin(sceneT * 0.022) * 6;
    const sitterCX = W * 0.69;   // right of fire, reclined in chair, flies kite
    const sitterGY = nearHillY(sitterCX);
    const houseCX  = W * 0.80;
    const houseGY  = nearHillY(houseCX);
    const fireCX   = W * 0.63;
    const fireGY   = nearHillY(fireCX);

    // Left tower — drawn before trees so foliage naturally layers in front
    const leftTowerCX = W * 0.05;
    drawLeftTower(leftTowerCX, nearHillY(leftTowerCX));

    const treeDefs = [
      { x: W * 0.14, type: 'pine',  scale: 1.05 },
      { x: W * 0.24, type: 'round', scale: 1.25 },
      { x: W * 0.36, type: 'pine',  scale: 1.55 },
      { x: W * 0.48, type: 'round', scale: 1.15 },
      { x: W * 0.58, type: 'pine',  scale: 0.90 },
    ];

    for (const td of treeDefs) {
      const gy = nearHillY(td.x);
      if (td.type === 'pine') drawPineTree(td.x, gy, td.scale);
      else                    drawRoundTree(td.x, gy, td.scale);
    }

    // Randomly toggle one window light every 1–4 seconds (6 windows max)
    winToggleTimer--;
    if (winToggleTimer <= 0) {
      const idx = Math.floor(Math.random() * 6);
      WIN_STATES[idx] = !WIN_STATES[idx];
      winToggleTimer = 600 + Math.floor(Math.random() * 1200);  // 10–30 s
    }

    // Magical height: pick a random target, lerp toward it, repeat.
    // New target chosen when close enough OR timer expires (~1-2 min).
    if (Math.abs(houseHS - houseTargetHS) < 0.4 || houseTimer <= 0) {
      houseTargetHS = 0.6 + Math.random() * 9.4;  // 0.6× (cottage) to 10× (tower)
      houseTimer    = 3600 + Math.floor(Math.random() * 3600);  // 1–2 min safety reset
    }
    houseTimer--;
    houseHS += (houseTargetHS - houseHS) * 0.0003;  // ~2 min to traverse full range
    drawHouse(houseCX, houseGY, houseHS);
    // Chimney smoke — top of chimney = wall top − (hr-6) = −50*hs − 20
    drawSmokeCloud(SMOKE, houseCX + 14, houseGY - 50 * houseHS - 20, 11, 50, 0.18);

    // Fire + fire smoke between trees and person
    drawFire(fireCX, fireGY);
    // Fire smoke starts just above the flame tip (~22 px up)
    drawSmokeCloud(FIRE_SMOKE, fireCX, fireGY - 22, 7, 36, 0.13);

    // Kite
    ctx.fillStyle = SIL;
    ctx.beginPath();
    ctx.moveTo(kiteX,       kiteY - 20);
    ctx.lineTo(kiteX + 15,  kiteY);
    ctx.lineTo(kiteX,       kiteY + 24);
    ctx.lineTo(kiteX - 15,  kiteY);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = SIL; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(kiteX, kiteY + 24);
    ctx.bezierCurveTo(kiteX + 9, kiteY + 34, kiteX - 6, kiteY + 43, kiteX + 7, kiteY + 55);
    ctx.stroke();

    // String anchor = sitter's raised arm tip
    // world_x = (cx+7) - 20·sin(0.35) ≈ cx+1  |  world_y = (gy-29) - 20·cos(0.35) ≈ gy-48
    const hx = sitterCX + 1, hy = sitterGY - 48;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(
      hx + (kiteX - hx) * 0.35,
      (hy + kiteY + 24) / 2 + 22,
      kiteX, kiteY + 24
    );
    ctx.strokeStyle = 'rgba(5,18,12,0.60)'; ctx.lineWidth = 0.9; ctx.stroke();

    // Witch hovering near tower on broomstick
    drawWitch(witchCX, witchDrawY);
    drawChair(sitterCX, sitterGY);
    drawSitter(sitterCX, sitterGY);
  }

  // ── Falling pages ─────────────────────────────────────────────────────────

  function drawPage(p) {
    const sx = Math.sin(p.sp) * p.sa;
    ctx.save();
    ctx.translate(p.x + sx, p.y);
    ctx.rotate(p.ang);
    const hw = p.pw / 2, hh = p.ph / 2;
    ctx.fillStyle = `rgba(242,236,221,${p.op})`;
    ctx.fillRect(-hw, -hh, p.pw, p.ph);
    ctx.strokeStyle = `rgba(31,61,46,${p.op * 0.28})`;
    ctx.lineWidth = 0.5;
    const gap = p.ph / (p.nLines + 1.5);
    for (let i = 1; i <= p.nLines; i++) {
      const ly = -hh + gap * (i + 0.4);
      ctx.beginPath(); ctx.moveTo(-hw + 3, ly); ctx.lineTo(hw - 3, ly); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(31,61,46,${p.op * 0.40})`;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(-hw, -hh, p.pw, p.ph);
    ctx.restore();
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  function frame() {
    drawSky();
    drawStars();
    tickShootingStar();
    drawMoon();
    drawHills();
    drawFog();
    drawScene();

    if (showPages) {
      for (const p of pages) {
        p.sp += p.ss; p.ang += p.spin; p.y += p.vy;
        drawPage(p);
        if (p.y > H + p.ph + 20) Object.assign(p, mkPage(false));
      }
    }

    requestAnimationFrame(frame);
  }

  frame();
})();
