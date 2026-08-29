/**
 * Glide VR — the room.
 *
 * Four glass panels on an arc that rotates to bring the one you want to the
 * front, an assistant orb below them, and a voice loop listening for
 * "Hey Glide". The user never walks; the panels come to them.
 *
 * Runs in two modes: a dark VR room, or passthrough, where the panels float in
 * your actual room. Passthrough is the better mode for a finance review you
 * might spend fifteen minutes in.
 */

import * as THREE from './vendor/three.module.js';
import { T } from './theme.js';
import * as data from './data.js';
import { answer } from './agent.js';
import { Voice, Phase } from './voice.js';
import {
  Panel, drawOverview, drawCategories, drawObligations, drawIncome, drawAssistant,
} from './panel.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const ORDER = ['overview', 'categories', 'obligations', 'income'];
const LABELS = { overview: 'Overview', categories: 'Categories', obligations: 'Recurring', income: 'Income' };
// Where each panel sits on the arc, before the arc is rotated.
const BASE_ANGLES = [-0.62, -0.21, 0.21, 0.62];
const RADIUS = 1.95;
const PANEL_Y = 1.52;

const state = {
  ledger: null,
  user: null,
  history: [],
  assistant: { phase: Phase.Off, transcript: '', reply: '', engine: '', error: '' },
  focus: 0,
  passthrough: false,
  level: 0,
};

let renderer, scene, camera, rig, clock;
let panelRig, panels = {}, tabs;
let orb, bars = [], orbGlow;
let room = [];               // the objects hidden in passthrough
let voice = null;
let started = false;
let micReady = false;
let rigTargetY = 0;
let stickCooldown = 0;

const raycaster = new THREE.Raycaster();
const tmpMatrix = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// Sign-in shell
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
let isSignUp = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}

function showAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function showReady() {
  $('view-auth').hidden = true;
  $('view-ready').hidden = false;
  const u = data.currentUser();
  $('ready-sub').textContent = u ? `Signed in as ${u.email}.` : 'Signed in.';
}

$('toggle').addEventListener('click', () => {
  isSignUp = !isSignUp;
  $('auth-title').textContent = isSignUp ? 'Create account' : 'Sign in';
  $('submit').textContent = isSignUp ? 'Create account' : 'Sign in';
  $('toggle-label').textContent = isSignUp ? 'Already registered?' : 'No account yet?';
  $('toggle').textContent = isSignUp ? 'Sign in' : 'Create one';
  showAuthError('');
});

$('submit').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email.includes('@') || password.length < 6) {
    showAuthError('Enter an email and a password of at least 6 characters.');
    return;
  }
  $('submit').disabled = true;
  showAuthError('');
  try {
    if (isSignUp) await data.signUp(email, password);
    else await data.signIn(email, password);
    showReady();
  } catch (e) {
    showAuthError(e.message);
  } finally {
    $('submit').disabled = false;
  }
});

$('signout').addEventListener('click', () => {
  data.signOut();
  location.reload();
});

$('enter').addEventListener('click', () => launch('vr'));
$('enter-ar').addEventListener('click', () => launch('ar'));
$('preview').addEventListener('click', () => launch('preview'));

if (data.currentUser()) showReady();

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

function say(text, kind = '') {
  const msg = $('ready-msg');
  msg.hidden = false;
  msg.className = 'msg ' + kind;
  msg.textContent = text;
}

/**
 * Ask for the microphone on the flat page, while a permission dialog can still
 * be drawn. Asking after entering an immersive session fails silently, which
 * is exactly how the voice agent came to look broken.
 */
async function primeMic() {
  if (micReady) return true;
  try {
    await startVoice();
    micReady = true;
    return true;
  } catch {
    return false;
  }
}

async function launch(mode) {
  say('Loading your ledger…');

  try {
    state.user = data.currentUser();
    state.ledger = await data.fetchLedger();
  } catch (e) {
    say(e.message, 'err');
    return;
  }

  if (state.ledger.empty) {
    say('Signed in, but your phone has not synced any data to this account yet. Entering anyway.', '');
  }

  say('Allow the microphone so you can talk to Glide…');
  const gotMic = await primeMic();
  if (!gotMic) say('Continuing without the microphone — you can still read everything.', 'err');

  await document.fonts.ready;
  if (!started) { buildScene(); started = true; }
  redrawAll();

  if (mode === 'preview') {
    $('shell').hidden = true;
    setPassthrough(false);
    return;
  }

  const sessionMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
  if (!navigator.xr) { say('This browser has no WebXR. Open Glide VR on your Quest.', 'err'); return; }

  const ok = await navigator.xr.isSessionSupported(sessionMode).catch(() => false);
  if (!ok) {
    say(
      mode === 'ar'
        ? 'Passthrough is not available here. Try Enter VR.'
        : 'Immersive VR is not available here. Try Preview on screen.',
      'err'
    );
    return;
  }

  try {
    const session = await navigator.xr.requestSession(sessionMode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    await renderer.xr.setSession(session);
    setPassthrough(mode === 'ar');
    session.addEventListener('end', () => {
      $('shell').hidden = false;
      say('Left immersive mode.', '');
    });
  } catch (e) {
    say('Could not start: ' + (e.message || e), 'err');
    return;
  }

  $('shell').hidden = true;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

function buildScene() {
  // alpha:true so passthrough can composite the real room behind the panels.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);
  camera.position.set(0, 1.6, 0);

  rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  clock = new THREE.Clock();

  environment();
  layout();
  buildOrb();
  controllers();
  setPassthrough(false);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(frame);
}

function environment() {
  const grid = new THREE.GridHelper(40, 80, 0x2a2a2a, 0x1c1c1c);
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  scene.add(grid);
  room.push(grid);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(22, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x101010 })
  );
  floor.position.y = -0.01;
  scene.add(floor);
  room.push(floor);

  const bloom = (color, x, z) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(7, 24, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.055, side: THREE.BackSide })
    );
    m.position.set(x, 3.2, z);
    scene.add(m);
    room.push(m);
  };
  bloom(0x60a5fa, -6, -6);
  bloom(0xc084fc, 7, -5);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
}

/** In passthrough the room must get out of the way entirely. */
function setPassthrough(on) {
  state.passthrough = on;
  room.forEach((o) => { o.visible = !on; });
  scene.background = on ? null : new THREE.Color(T.bg);
  scene.fog = on ? null : new THREE.FogExp2(0x0d0d0d, 0.055);
  renderer.setClearAlpha(on ? 0 : 1);
  if (tabs) drawTabs();
}

function layout() {
  panelRig = new THREE.Group();
  scene.add(panelRig);

  ORDER.forEach((name, i) => {
    // One size for all four, so any panel can hold any slot on the arc.
    const p = new Panel(1.22, 0.86);
    p.mesh.name = name;
    p.mesh.userData.index = i;
    const a = BASE_ANGLES[i];
    p.mesh.position.set(Math.sin(a) * RADIUS, PANEL_Y, -Math.cos(a) * RADIUS);
    p.mesh.rotation.y = -a;
    panelRig.add(p.mesh);
    panels[name] = p;
  });

  // A thin bar naming the four panels, so switching is discoverable without
  // anyone having to guess that the thumbstick does something.
  tabs = new Panel(1.05, 0.11, { radius: 0.03 });
  tabs.mesh.name = '__tabs';
  tabs.mesh.position.set(0, 1.00, -1.28);
  tabs.mesh.rotation.x = 0.22;
  scene.add(tabs.mesh);

  const a = new Panel(1.05, 0.40, { radius: 0.045 });
  a.mesh.name = '__assistant';
  a.mesh.position.set(0, 0.74, -1.10);
  a.mesh.rotation.x = 0.42;
  scene.add(a.mesh);
  panels.assistant = a;

  // Seed the arc rotation. Without this the target stays at 0 while panel 0
  // sits at its own base angle, so the first panel opens off to one side.
  setFocus(0);
  panelRig.rotation.y = rigTargetY;
}

function buildOrb() {
  orb = new THREE.Group();
  orb.position.set(0, 1.14, -1.16);
  scene.add(orb);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.048, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xfafafa })
  );
  orb.add(core);
  orb.userData.core = core;

  orbGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.16, side: THREE.BackSide })
  );
  orb.add(orbGlow);

  const N = 44;
  const geo = new THREE.BoxGeometry(0.006, 1, 0.006);
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xfafafa, transparent: true, opacity: 0.55 })
    );
    const a = (i / N) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.098, 0, Math.sin(a) * 0.098);
    m.rotation.y = -a;
    m.scale.y = 0.02;
    orb.add(m);
    bars.push(m);
  }
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

const hands = [];

function controllers() {
  const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
  ]);

  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(
      rayGeo,
      new THREE.LineBasicMaterial({ color: 0xfafafa, transparent: true, opacity: 0.45 })
    );
    line.scale.z = 3;
    c.add(line);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa })
    );
    dot.visible = false;
    scene.add(dot);

    // Trigger points and selects. Squeeze always talks. Pointing at nothing
    // and pulling the trigger also talks, so the gesture is never a dead end.
    c.addEventListener('selectstart', () => {
      const hit = pick(c);
      if (hit) activate(hit);
      else talk();
    });
    c.addEventListener('squeezestart', () => talk());

    rig.add(c);
    hands.push({ controller: c, dot, line });
  }
}

function talk() {
  if (!voice) return;
  if (state.assistant.phase === Phase.Speaking) voice.stopSpeaking();
  voice.arm();
}

/** Raycast a controller against the panels and the tab bar. */
function pick(controller) {
  tmpMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);

  const targets = ORDER.map((n) => panels[n].mesh).concat([tabs.mesh]);
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0] : null;
}

function activate(hit) {
  const name = hit.object.name;
  if (name === '__tabs') {
    // Which quarter of the bar was hit -> which tab.
    const u = hit.uv ? hit.uv.x : 0.5;
    setFocus(Math.max(0, Math.min(ORDER.length - 1, Math.floor(u * ORDER.length))));
    return;
  }
  const i = hit.object.userData.index;
  if (typeof i === 'number') setFocus(i);
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

function setFocus(i) {
  state.focus = ((i % ORDER.length) + ORDER.length) % ORDER.length;
  // Rotating the arc by +theta moves a panel from azimuth a to a - theta, so
  // bringing the chosen one to dead ahead means rotating by its own angle.
  rigTargetY = BASE_ANGLES[state.focus];
  drawTabs();
}

function cycleFocus(dir) {
  setFocus(state.focus + dir);
}

// Arrow keys move between tabs on the flat preview, where there is no
// thumbstick to read.
window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.key === 'ArrowRight') cycleFocus(1);
  else if (e.key === 'ArrowLeft') cycleFocus(-1);
  else if (e.key >= '1' && e.key <= '4') setFocus(Number(e.key) - 1);
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function redrawAll() {
  const a = state.ledger;
  drawOverview(panels.overview, a, state.user);
  drawCategories(panels.categories, a);
  drawObligations(panels.obligations, a);
  drawIncome(panels.income, a);
  drawAssistant(panels.assistant, state.assistant);
  drawTabs();
}

function drawTabs() {
  const p = tabs;
  p.clear();
  p.background({ strong: true });
  const w = p.W / ORDER.length;
  ORDER.forEach((name, i) => {
    const active = i === state.focus;
    if (active) {
      const { c } = p;
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.14)';
      const r = p.H * 0.34;
      c.beginPath();
      c.roundRect(i * w + 10, 12, w - 20, p.H - 24, r);
      c.fill();
      c.restore();
    }
    p.text(LABELS[name], i * w + w / 2, p.H / 2, {
      size: 30, align: 'center', baseline: 'middle',
      color: active ? T.fg : T.muted, weight: active ? '600' : '400',
    });
  });
  p.commit();
}

function redrawAssistant() {
  drawAssistant(panels.assistant, state.assistant);
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

function startVoice() {
  if (voice) return Promise.resolve();
  voice = new Voice({
    onPhase: (p) => { state.assistant.phase = p; redrawAssistant(); },
    onTranscript: (t) => { state.assistant.transcript = t; state.assistant.error = ''; redrawAssistant(); },
    onLevel: (l) => { state.level = l; },
    onError: (e) => { state.assistant.error = e; redrawAssistant(); },
    onQuestion: async (question) => {
      state.assistant.transcript = question;
      state.assistant.error = '';
      redrawAssistant();

      const low = question.toLowerCase();
      // Mode switching by voice, since it is awkward to reach otherwise.
      if (low.includes('passthrough') || low.includes('see my room')) {
        await swapMode('ar');
        return 'Switching to passthrough.';
      }
      if (low.includes('dark room') || low.includes('vr mode')) {
        await swapMode('vr');
        return 'Back to the dark room.';
      }

      const res = await answer(question, state.ledger, state.history);
      state.history.push({ role: 'user', content: question });
      state.history.push({ role: 'assistant', content: res.text });
      if (state.history.length > 12) state.history.splice(0, state.history.length - 12);

      if (res.action === 'signOut') {
        data.signOut();
        setTimeout(() => location.reload(), 1200);
      } else if (res.action === 'refresh') {
        try {
          state.ledger = await data.fetchLedger();
          redrawAll();
        } catch (e) {
          state.assistant.error = e.message;
        }
      } else if (res.action && res.action.startsWith('focus:')) {
        const i = ORDER.indexOf(res.action.split(':')[1]);
        if (i >= 0) setFocus(i);
      }

      state.assistant.reply = res.text;
      state.assistant.engine = res.engine;
      redrawAssistant();
      return res.text;
    },
  });

  return voice.start().catch((e) => {
    state.assistant.error = 'Microphone blocked. Allow mic access to talk to Glide.';
    state.assistant.phase = Phase.Off;
    redrawAssistant();
    voice = null;
    throw e;
  });
}

/** Session mode cannot change in place, so end and immediately re-request. */
async function swapMode(mode) {
  const session = renderer.xr.getSession();
  if (!session) { setPassthrough(mode === 'ar'); return; }
  const want = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
  try {
    await session.end();
    const next = await navigator.xr.requestSession(want, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    await renderer.xr.setSession(next);
    setPassthrough(mode === 'ar');
    $('shell').hidden = true;
  } catch {
    // Quest requires a fresh gesture for this; the shell offers both buttons.
    $('shell').hidden = false;
    say('Pick a mode to continue.', '');
  }
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

const tint = {
  [Phase.Off]: new THREE.Color(0x6b6b6b),
  [Phase.Waiting]: new THREE.Color(0xa6a6a6),
  [Phase.Listening]: new THREE.Color(0x60a5fa),
  [Phase.Thinking]: new THREE.Color(0xfbbf24),
  [Phase.Speaking]: new THREE.Color(0x4ade80),
};

function readSticks(dt) {
  stickCooldown = Math.max(0, stickCooldown - dt);
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp || !gp.axes) continue;
    // Quest maps the thumbstick to axes 2/3; fall back to 0/1.
    const x = gp.axes.length > 2 ? gp.axes[2] : gp.axes[0];
    if (typeof x !== 'number') continue;
    if (Math.abs(x) > 0.7 && stickCooldown === 0) {
      cycleFocus(x > 0 ? 1 : -1);
      stickCooldown = 0.35;
    }
  }
}

function frame() {
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  const phase = state.assistant.phase;
  const level = state.level || 0;

  readSticks(dt);

  // The arc eases around so the chosen panel arrives in front of you.
  panelRig.rotation.y += (rigTargetY - panelRig.rotation.y) * Math.min(1, dt * 6);

  ORDER.forEach((name, i) => {
    const p = panels[name];
    const active = i === state.focus;
    const want = active ? 1.06 : 0.9;
    const s = p.mesh.scale.x + (want - p.mesh.scale.x) * Math.min(1, dt * 7);
    p.mesh.scale.setScalar(s);
    const wantO = active ? 1 : 0.62;
    p.mesh.material.opacity += (wantO - p.mesh.material.opacity) * Math.min(1, dt * 7);

    const a = BASE_ANGLES[i];
    const r = RADIUS - (active ? 0.16 : 0);
    p.mesh.position.set(Math.sin(a) * r, PANEL_Y, -Math.cos(a) * r);
  });

  // Pointer dots where the rays land.
  for (const h of hands) {
    const hit = pick(h.controller);
    if (hit) {
      h.dot.visible = true;
      h.dot.position.copy(hit.point);
      h.line.scale.z = hit.distance;
    } else {
      h.dot.visible = false;
      h.line.scale.z = 3;
    }
  }

  const c = tint[phase] || tint[Phase.Waiting];
  orb.userData.core.material.color.lerp(c, 0.08);
  orbGlow.material.color.lerp(c, 0.08);
  orbGlow.material.opacity = 0.12 + (phase === Phase.Speaking ? 0.14 : level * 0.2);

  const breathe = 1 + Math.sin(t * 1.6) * 0.045;
  orb.userData.core.scale.setScalar(phase === Phase.Thinking ? breathe * 1.05 : breathe);
  orb.rotation.y = phase === Phase.Thinking ? t * 0.9 : t * 0.16;

  bars.forEach((b, i) => {
    const n = bars.length;
    let amp;
    if (phase === Phase.Listening) {
      amp = 0.012 + (0.02 + level * 0.16) * (0.55 + 0.45 * Math.sin(t * 7 + i * 0.55));
    } else if (phase === Phase.Speaking) {
      const d = Math.abs(i - n / 2) / (n / 2);
      amp = 0.014 + 0.075 * Math.max(0, Math.sin(t * 5.5 - d * 3.1)) * (1 - d * 0.55);
    } else if (phase === Phase.Thinking) {
      amp = 0.012 + 0.022 * (0.5 + 0.5 * Math.sin(t * 3.2 + i * 0.42));
    } else {
      amp = 0.010 + 0.006 * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 0.3));
    }
    b.scale.y += (amp * 12 - b.scale.y) * 0.28;
    b.material.color.lerp(c, 0.06);
    b.material.opacity = 0.32 + Math.min(0.55, b.scale.y * 1.4);
  });

  renderer.render(scene, camera);
}
