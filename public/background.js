(function () {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');
  let W, H;

  const showPages = document.body.dataset.bgPages === 'true';

  // Sky gradient: dark forest green at top → warm amber at horizon
  const SKY = [
    [0.00, [10, 20, 15]],
    [0.42, [22, 40, 30]],
    [0.72, [52, 34, 14]],
    [1.00, [72, 44, 16]],
  ];

  // Three parallax hill silhouette layers, far → near
  const HILL_DEFS = [
    { hFrac: 0.66, rate: 0.00025, amp: 0.090, rgb: [18, 48, 34] },
    { hFrac: 0.77, rate: 0.00050, amp: 0.065, rgb: [12, 37, 26] },
    { hFrac: 0.87, rate: 0.00090, amp: 0.045, rgb: [7,  26, 17] },
  ];
  const hills = HILL_DEFS.map(d => ({ ...d, phase: Math.random() * Math.PI * 2 }));

  // Falling pages (login page only — app page has its own div-based animation)
  const PAGE_N = 28;
  let pages = [];

  function mkPage(atTop) {
    const pw = Math.random() * 22 + 16;
    const ph = pw * (1.28 + Math.random() * 0.22);
    return {
      x:      Math.random() * (W || 800) * 0.52,
      y:      atTop ? Math.random() * (H || 600) : -(ph + Math.random() * 120),
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

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  if (showPages) pages = Array.from({ length: PAGE_N }, () => mkPage(true));

  // Shared silhouette colour — slightly darker than the near hill
  const SIL = 'rgb(5,18,12)';

  // Returns the near hill's surface Y at a given canvas X.
  // Called each frame after hills have scrolled so positions stay grounded.
  function nearHillY(x) {
    const hl = hills[2];
    const t  = x / W;
    return H * hl.hFrac
      - Math.sin(t * Math.PI * 2.4 + hl.phase)       * H * hl.amp
      - Math.sin(t * Math.PI * 4.9 + hl.phase * 1.7) * H * hl.amp * 0.32
      - Math.sin(t * Math.PI * 1.2 + hl.phase * 0.6) * H * hl.amp * 0.52;
  }

  // ── Scene elements ────────────────────────────────────────────────────────

  function drawPineTree(cx, gy, scale) {
    ctx.fillStyle = SIL;
    const h = 52 * scale, w = 13 * scale;
    ctx.fillRect(cx - 2.5 * scale, gy - h * 0.22, 5 * scale, h * 0.22); // trunk
    ctx.beginPath(); // lower tier
    ctx.moveTo(cx - w,        gy - h * 0.18);
    ctx.lineTo(cx + w,        gy - h * 0.18);
    ctx.lineTo(cx,            gy - h * 0.68);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); // upper tier
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

  function drawHouse(cx, gy) {
    ctx.fillStyle = SIL;
    const w = 52, hb = 38, hr = 26;
    ctx.fillRect(cx - w / 2, gy - hb, w, hb + 20);        // body (+20 embeds base into hill slope)
    ctx.beginPath();                                      // roof
    ctx.moveTo(cx - w / 2 - 5, gy - hb);
    ctx.lineTo(cx + w / 2 + 5, gy - hb);
    ctx.lineTo(cx,             gy - hb - hr);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(cx + 10, gy - hb - hr + 6, 9, hr - 2); // chimney
    // Warm glowing windows
    ctx.shadowColor = 'rgba(201,162,39,0.9)';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = 'rgba(201,162,39,0.55)';
    ctx.fillRect(cx - 12, gy - hb + 10, 12, 13);
    ctx.fillRect(cx +  6, gy - hb + 10, 10, 13);
    ctx.shadowBlur = 0;
  }

  // Seated reader. Right arm tip (kite hand) is at (cx+17, gy-46) — must match string anchor.
  function drawReader(cx, gy) {
    ctx.fillStyle = 'rgb(4,15,10)';
    // Seated legs — flat ellipse at ground
    ctx.beginPath();
    ctx.ellipse(cx - 2, gy - 5, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Torso
    ctx.fillRect(cx - 5, gy - 26, 10, 16);
    // Head
    ctx.beginPath();
    ctx.arc(cx + 2, gy - 34, 7, 0, Math.PI * 2);
    ctx.fill();
    // Left arm + open book
    ctx.fillRect(cx - 13, gy - 22, 9, 4);
    ctx.fillRect(cx - 15, gy - 20, 15, 8);
    // Right arm raised — translate(cx+5,gy-24), rotate(-0.5), length 25
    // Tip: cx+5+25·sin(0.5) ≈ cx+17  |  gy-24-25·cos(0.5) ≈ gy-46
    // Head top at gy-41 → hand is 5px above head ✓
    ctx.save();
    ctx.translate(cx + 5, gy - 24);
    ctx.rotate(-0.5);
    ctx.fillRect(-2, -25, 4, 25);
    ctx.restore();
  }

  // ── Kite (animated) ───────────────────────────────────────────────────────

  let sceneT = 0;

  function drawScene() {
    sceneT++;

    // Kite bobs gently in the sky
    const kiteX = W * 0.50 + Math.sin(sceneT * 0.014) * 10;
    const kiteY = H * 0.20 + Math.sin(sceneT * 0.023) * 10;

    const personCX = W * 0.70;
    const personGY = nearHillY(personCX);
    const houseCX  = W * 0.80;
    const houseGY  = nearHillY(houseCX);

    const treeDefs = [
      { x: W * 0.06, type: 'pine',  scale: 0.75 },
      { x: W * 0.18, type: 'round', scale: 0.88 },
      { x: W * 0.32, type: 'pine',  scale: 1.05 },
      { x: W * 0.46, type: 'round', scale: 0.78 },
      { x: W * 0.58, type: 'pine',  scale: 0.68 },
    ];

    for (const td of treeDefs) {
      const gy = nearHillY(td.x);
      if (td.type === 'pine') drawPineTree(td.x, gy, td.scale);
      else                    drawRoundTree(td.x, gy, td.scale);
    }

    drawHouse(houseCX, houseGY);

    // Kite diamond + tail (enlarged ~1.7×)
    ctx.fillStyle = SIL;
    ctx.beginPath();
    ctx.moveTo(kiteX,       kiteY - 20);
    ctx.lineTo(kiteX + 15,  kiteY);
    ctx.lineTo(kiteX,       kiteY + 24);
    ctx.lineTo(kiteX - 15,  kiteY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = SIL;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(kiteX, kiteY + 24);
    ctx.bezierCurveTo(kiteX + 9, kiteY + 34, kiteX - 6, kiteY + 43, kiteX + 7, kiteY + 55);
    ctx.stroke();

    // String from reader's raised hand to kite bottom
    const hx = personCX + 17, hy = personGY - 46;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(
      hx + (kiteX - hx) * 0.35,
      (hy + kiteY + 24) / 2 + 22,
      kiteX, kiteY + 24
    );
    ctx.strokeStyle = 'rgba(5,18,12,0.60)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Reader drawn last so they appear in front of house
    drawReader(personCX, personGY);
  }

  // ── Core render loop ──────────────────────────────────────────────────────

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [stop, [r, gv, b]] of SKY) g.addColorStop(stop, `rgb(${r},${gv},${b})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

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
      ctx.beginPath();
      ctx.moveTo(-hw + 3, ly);
      ctx.lineTo(hw - 3, ly);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(31,61,46,${p.op * 0.40})`;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(-hw, -hh, p.pw, p.ph);
    ctx.restore();
  }

  function frame() {
    drawSky();
    drawHills();
    drawScene();

    if (showPages) {
      for (const p of pages) {
        p.sp  += p.ss;
        p.ang += p.spin;
        p.y   += p.vy;
        drawPage(p);
        if (p.y > H + p.ph + 20) Object.assign(p, mkPage(false));
      }
    }

    requestAnimationFrame(frame);
  }

  frame();
})();
