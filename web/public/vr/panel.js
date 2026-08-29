/**
 * Glide VR — glass panels.
 *
 * Every surface in the room is a canvas drawn with the same language as the
 * phone: a near-black ground, a hairline white border, generous negative space
 * and colour reserved for meaning. Text is drawn at 900px per metre so it stays
 * legible at arm's length through the Quest's lenses.
 */

import * as THREE from './vendor/three.module.js';
import { T, DISPLAY, SANS, rupees, compact } from './theme.js';

const PPM = 900;

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export class Panel {
  constructor(widthM, heightM, { radius = 0.05 } = {}) {
    this.w = widthM;
    this.h = heightM;
    this.radius = radius;

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(widthM * PPM);
    this.canvas.height = Math.round(heightM * PPM);
    this.c = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 8;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;

    const geo = new THREE.PlaneGeometry(widthM, heightM);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.panel = this;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  clear() {
    const { c } = this;
    c.clearRect(0, 0, this.W, this.H);
  }

  /** The glass slab everything else sits on. */
  background({ strong = false, tint = null } = {}) {
    const { c } = this;
    const r = this.radius * PPM;
    c.save();
    roundRect(c, 2, 2, this.W - 4, this.H - 4, r);

    const g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, strong ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.075)');
    g.addColorStop(1, 'rgba(255,255,255,0.035)');
    c.fillStyle = g;
    c.fill();

    // A very dark base keeps the passthrough/skybox from washing out the type.
    c.globalCompositeOperation = 'destination-over';
    c.fillStyle = 'rgba(12,12,12,0.86)';
    c.fill();
    c.globalCompositeOperation = 'source-over';

    c.lineWidth = 2.5;
    c.strokeStyle = tint || T.glassBorder;
    c.stroke();
    c.restore();
  }

  text(str, x, y, {
    size = 28, color = T.fg, font = SANS, weight = '400',
    align = 'left', baseline = 'alphabetic', maxWidth = null, letterSpacing = null,
  } = {}) {
    const { c } = this;
    c.save();
    c.font = `${weight} ${size}px ${font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = baseline;
    if (letterSpacing && 'letterSpacing' in c) c.letterSpacing = `${letterSpacing}px`;
    if (maxWidth) c.fillText(str, x, y, maxWidth);
    else c.fillText(str, x, y);
    c.restore();
  }

  /** Word-wrapped body copy. Returns the y after the last line. */
  paragraph(str, x, y, width, { size = 26, color = T.muted, lineHeight = 1.45, maxLines = 6 } = {}) {
    const { c } = this;
    c.save();
    c.font = `400 ${size}px ${SANS}`;
    c.fillStyle = color;
    c.textBaseline = 'top';

    const words = String(str).split(/\s+/);
    let line = '';
    let cy = y;
    let lines = 0;

    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (c.measureText(probe).width > width && line) {
        if (++lines >= maxLines) {
          c.fillText(line.replace(/\s\S*$/, '') + '…', x, cy);
          c.restore();
          return cy + size * lineHeight;
        }
        c.fillText(line, x, cy);
        cy += size * lineHeight;
        line = word;
      } else {
        line = probe;
      }
    }
    if (line) { c.fillText(line, x, cy); cy += size * lineHeight; }
    c.restore();
    return cy;
  }

  sectionTitle(str, x, y) {
    this.text(str.toUpperCase(), x, y, {
      size: 22, color: T.muted, weight: '600', letterSpacing: 2.4, baseline: 'top',
    });
  }

  divider(x, y, w) {
    const { c } = this;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.09)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.stroke();
    c.restore();
  }

  pill(str, x, y, { color = T.muted, bg = 'rgba(255,255,255,0.08)', size = 22 } = {}) {
    const { c } = this;
    c.save();
    c.font = `600 ${size}px ${SANS}`;
    const w = c.measureText(str).width + 34;
    const h = size + 22;
    roundRect(c, x, y, w, h, h / 2);
    c.fillStyle = bg;
    c.fill();
    c.fillStyle = color;
    c.textBaseline = 'middle';
    c.fillText(str, x + 17, y + h / 2 + 1);
    c.restore();
    return w;
  }

  /** Horizontal proportion bar, used for category share. */
  bar(x, y, w, h, fraction, color) {
    const { c } = this;
    c.save();
    roundRect(c, x, y, w, h, h / 2);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    const fw = Math.max(h, w * Math.max(0, Math.min(1, fraction)));
    roundRect(c, x, y, fw, h, h / 2);
    c.fillStyle = color;
    c.fill();
    c.restore();
  }

  commit() {
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Panel content
// ---------------------------------------------------------------------------

export function drawOverview(p, a, user) {
  p.clear();
  p.background({ strong: true });
  const M = 64;

  p.sectionTitle('Safe to spend', M, M);

  if (a.empty) {
    p.text('No data yet', M, M + 66, { size: 72, font: DISPLAY, weight: '700', baseline: 'top' });
    let y = p.paragraph(
      'This account has nothing synced to it. Open Glide on your phone, sign in with ' +
        'the same account, and let it read your messages — this room fills the moment it does.',
      M, M + 168, p.W - M * 2, { size: 26 }
    );
    // Naming the account is the fastest way to spot the usual cause: the
    // headset and the phone signed in as two different people.
    p.text('Signed in here as', M, y + 22, { size: 20, color: T.muted, weight: '600', letterSpacing: 2, baseline: 'top' });
    p.text(user?.email || '(unknown)', M, y + 52, { size: 30, weight: '600', baseline: 'top' });
    return p.commit();
  }

  p.text(rupees(a.safeToSpend), M, M + 66, {
    size: 118, font: DISPLAY, weight: '700', baseline: 'top',
  });

  p.paragraph(
    `${rupees(a.net)} net over ${a.windowDays} days, above your ${rupees(a.bufferFloor)} floor.`,
    M, M + 208, p.W - M * 2, { size: 27 }
  );

  p.divider(M, M + 280, p.W - M * 2);

  // In / out / run-rate as three columns.
  const colW = (p.W - M * 2) / 3;
  const stats = [
    ['In', compact(a.totalIn), T.positive],
    ['Out', compact(a.totalOut), T.negative],
    ['Per day', compact(a.dailyRunRate), T.fg],
  ];
  stats.forEach(([label, value, color], i) => {
    const x = M + colW * i;
    p.text(label.toUpperCase(), x, M + 320, { size: 20, color: T.muted, weight: '600', letterSpacing: 2, baseline: 'top' });
    p.text(value, x, M + 356, { size: 46, font: DISPLAY, weight: '600', color, baseline: 'top' });
  });

  p.divider(M, M + 440, p.W - M * 2);

  p.sectionTitle('Monthly income band', M, M + 470);
  p.text(
    `${compact(a.income.p10)} — ${compact(a.income.p90)}`,
    M, M + 508, { size: 44, font: DISPLAY, weight: '600', baseline: 'top' }
  );
  p.text(`median ${compact(a.income.p50)}`, M, M + 566, { size: 24, color: T.muted, baseline: 'top' });

  p.text(user?.email || '', p.W - M, p.H - M, { size: 20, color: T.muted, align: 'right', baseline: 'bottom' });
  p.commit();
}

export function drawCategories(p, a) {
  p.clear();
  p.background();
  const M = 56;
  p.sectionTitle('Where it went', M, M);

  const rows = a.categories.slice(0, 7);
  if (!rows.length) {
    p.paragraph('No categorised spending yet.', M, M + 70, p.W - M * 2);
    return p.commit();
  }

  const palette = [T.info, T.accent, T.warning, T.positive, T.negative, '#7DD3FC', '#FDA4AF'];
  let y = M + 66;
  rows.forEach((c, i) => {
    p.text(c.category, M, y, { size: 28, weight: '500', baseline: 'top' });
    p.text(compact(c.amount), p.W - M, y, { size: 28, weight: '600', font: DISPLAY, align: 'right', baseline: 'top' });
    p.bar(M, y + 42, p.W - M * 2, 12, c.share, palette[i % palette.length]);
    p.text(
      `${Math.round(c.share * 100)}% · ${c.count} txns${c.essential ? ' · essential' : ''}`,
      M, y + 66, { size: 20, color: T.muted, baseline: 'top' }
    );
    y += 118;
  });
  p.commit();
}

export function drawObligations(p, a) {
  p.clear();
  p.background();
  const M = 56;
  p.sectionTitle('Recurring', M, M);

  const rows = a.obligations.slice(0, 6);
  if (!rows.length) {
    p.paragraph(
      'Nothing recurring spotted yet. Glide finds these from repetition, so they appear as the pattern builds.',
      M, M + 70, p.W - M * 2
    );
    return p.commit();
  }

  let y = M + 66;
  rows.forEach((o) => {
    p.text(o.name, M, y, { size: 28, weight: '500', baseline: 'top', maxWidth: p.W - M * 2 - 200 });
    p.text(compact(o.expectedAmount), p.W - M, y, { size: 28, weight: '600', font: DISPLAY, align: 'right', baseline: 'top' });
    const conf = Math.round(o.confidence * 100);
    const tint = conf >= 80 ? T.positive : conf >= 55 ? T.warning : T.muted;
    p.text(
      `every ${o.cadenceDays}d · seen ${o.occurrences}×`,
      M, y + 40, { size: 21, color: T.muted, baseline: 'top' }
    );
    p.text(`${conf}%`, p.W - M, y + 40, { size: 21, color: tint, align: 'right', baseline: 'top' });
    y += 92;
    p.divider(M, y - 18, p.W - M * 2);
  });
  p.commit();
}

export function drawIncome(p, a) {
  p.clear();
  p.background();
  const M = 56;
  p.sectionTitle('Income', M, M);

  if (a.empty) {
    p.paragraph('No income data yet.', M, M + 70, p.W - M * 2);
    return p.commit();
  }

  // The band, drawn as a range rather than a single figure -- the whole point.
  const y = M + 130;
  const w = p.W - M * 2;
  const { c } = p;
  c.save();
  roundRect(c, M, y, w, 16, 8);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fill();

  const lo = a.income.p10, hi = a.income.p90, mid = a.income.p50;
  const span = Math.max(hi - lo, 1);
  const midX = M + w * Math.max(0.04, Math.min(0.96, (mid - lo) / span));
  roundRect(c, M, y, w, 16, 8);
  c.fillStyle = 'rgba(96,165,250,0.45)';
  c.fill();
  c.beginPath();
  c.arc(midX, y + 8, 18, 0, Math.PI * 2);
  c.fillStyle = T.fg;
  c.fill();
  c.restore();

  p.text(compact(lo), M, y + 44, { size: 24, color: T.muted, baseline: 'top' });
  p.text(compact(hi), p.W - M, y + 44, { size: 24, color: T.muted, align: 'right', baseline: 'top' });
  p.text(compact(mid), midX, y - 34, { size: 34, font: DISPLAY, weight: '600', align: 'center', baseline: 'bottom' });

  p.text('p10', M, y + 76, { size: 18, color: T.muted, baseline: 'top' });
  p.text('p90', p.W - M, y + 76, { size: 18, color: T.muted, align: 'right', baseline: 'top' });

  p.divider(M, y + 132, w);
  p.paragraph(a.income.basis, M, y + 162, w, { size: 24, maxLines: 3 });

  p.sectionTitle('Read from', M, y + 250);
  p.text(
    `${a.messagesScanned} messages · ${a.parsed} transactions · ${a.rejected} ignored`,
    M, y + 288, { size: 26, baseline: 'top' }
  );
  p.commit();
}

/** The assistant's own panel: phase, transcript, last answer. */
export function drawAssistant(p, { phase, transcript, reply, engine, error }) {
  p.clear();
  p.background({ strong: true, tint: 'rgba(255,255,255,0.16)' });
  const M = 48;

  const labels = {
    off: 'Voice off',
    waiting: 'Say “Hey Glide”',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking',
  };
  const tints = {
    off: T.muted, waiting: T.muted, listening: T.info, thinking: T.warning, speaking: T.positive,
  };

  p.text(labels[phase] || '', M, M, { size: 30, weight: '600', color: tints[phase] || T.fg, baseline: 'top' });
  if (engine) p.text(engine, p.W - M, M + 4, { size: 20, color: T.muted, align: 'right', baseline: 'top' });

  let y = M + 62;
  if (transcript) {
    y = p.paragraph(`“${transcript}”`, M, y, p.W - M * 2, { size: 27, color: T.fg, maxLines: 2 }) + 14;
  }
  if (error) {
    p.paragraph(error, M, y, p.W - M * 2, { size: 25, color: T.negative, maxLines: 2 });
  } else if (reply) {
    p.paragraph(reply, M, y, p.W - M * 2, { size: 26, color: T.muted, maxLines: 5 });
  }
  p.commit();
}
