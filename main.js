import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { Chess } from 'https://esm.sh/chess.js@1.0.0-beta.8';

const FILES = 'abcdefgh';
const LIGHT = 0xe8dcc4, DARK = 0x6b4f3a;
const IVORY = 0xf2ece0, OBSIDIAN = 0x39332e;

const game = new Chess();
let selected = null, legal = [], aiDepth = 3, playerColor = 'w', busy = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14100c);
scene.fog = new THREE.Fog(0x14100c, 14, 30);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6.0, 9.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2.15;
controls.target.set(0, 0.5, 0);

scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a2118, 0.9));
const key = new THREE.DirectionalLight(0xffe9c4, 2.4);
key.position.set(5, 11, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -8;
key.shadow.camera.right = key.shadow.camera.top = 8;
key.shadow.bias = -0.0009;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
rim.position.set(-6, 4, -6);
scene.add(rim);

// ---------- board ----------
const boardGroup = new THREE.Group();
scene.add(boardGroup);
const tileGeo = new THREE.BoxGeometry(1, 0.22, 1);
const tiles = {};
for (let row = 0; row < 8; row++) {
  for (let f = 0; f < 8; f++) {
    const dark = (row + f) % 2 === 1;
    const mat = new THREE.MeshStandardMaterial({ color: dark ? DARK : LIGHT, roughness: 0.85, metalness: 0 });
    const t = new THREE.Mesh(tileGeo, mat);
    t.position.set(f - 3.5, -0.11, row - 3.5);
    t.receiveShadow = true;
    t.userData.square = FILES[f] + (8 - row);
    boardGroup.add(t);
    tiles[t.userData.square] = t;
  }
}
const frame = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 0.3, 9.2),
  new THREE.MeshStandardMaterial({ color: 0x2e2118, roughness: 0.7 })
);
frame.position.y = -0.19;
frame.receiveShadow = true;
boardGroup.add(frame);

function squareToPos(sq) {
  const f = FILES.indexOf(sq[0]);
  const row = 8 - parseInt(sq[1]);
  return new THREE.Vector3(f - 3.5, 0, row - 3.5);
}

// ---------- pieces ----------
// GLB models drop in here by type; anything missing falls back to primitives.
const MODELS = {};
const pieceGroup = new THREE.Group();
scene.add(pieceGroup);
const mixers = [];

function primitive(type, color) {
  const mat = new THREE.MeshStandardMaterial({
    color: color === 'w' ? IVORY : OBSIDIAN,
    roughness: 0.55, metalness: 0.05,
  });
  const g = new THREE.Group();
  g.userData.isPrimitive = true;
  const add = (geo, y, s = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y; m.scale.setScalar(s);
    m.castShadow = true; g.add(m); return m;
  };
  add(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 24), 0.08);
  switch (type) {
    case 'p':
      add(new THREE.CylinderGeometry(0.16, 0.26, 0.34, 20), 0.33);
      add(new THREE.SphereGeometry(0.2, 20, 16), 0.62); break;
    case 'r':
      add(new THREE.CylinderGeometry(0.27, 0.32, 0.6, 20), 0.46);
      add(new THREE.BoxGeometry(0.62, 0.2, 0.62), 0.85); break;
    case 'n':
      add(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 20), 0.36);
      { const h = add(new THREE.BoxGeometry(0.28, 0.46, 0.5), 0.78);
        h.rotation.x = -0.35;
        const s = add(new THREE.BoxGeometry(0.26, 0.2, 0.3), 0.98);
        s.position.z = -0.16; s.rotation.x = -0.6; }
      break;
    case 'b':
      add(new THREE.CylinderGeometry(0.2, 0.3, 0.44, 20), 0.38);
      add(new THREE.ConeGeometry(0.25, 0.5, 20), 0.83);
      add(new THREE.SphereGeometry(0.09, 12, 10), 1.12); break;
    case 'q':
      add(new THREE.CylinderGeometry(0.22, 0.34, 0.6, 20), 0.46);
      add(new THREE.SphereGeometry(0.28, 22, 18), 0.92);
      add(new THREE.TorusGeometry(0.22, 0.05, 10, 24), 1.12).rotation.x = Math.PI / 2;
      break;
    case 'k':
      add(new THREE.CylinderGeometry(0.24, 0.34, 0.66, 20), 0.49);
      add(new THREE.CylinderGeometry(0.3, 0.26, 0.2, 20), 0.92);
      add(new THREE.BoxGeometry(0.1, 0.34, 0.1), 1.18);
      add(new THREE.BoxGeometry(0.26, 0.1, 0.1), 1.22); break;
  }
  return g;
}

function makePiece(type, color) {
  const src = MODELS[type];
  if (!src) return primitive(type, color);
  // plain clone() shares the skeleton and every copy collapses onto one pose
  const obj = skeletonClone(src.wrap);
  obj.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.material = o.material.clone();
      // one generated texture serves both armies; tint hard or the sides read alike
      if (color === 'b') {
        o.material.color.setRGB(0.10, 0.10, 0.15);
        o.material.roughness = 0.65;
      } else {
        o.material.color.setRGB(1.9, 1.82, 1.6);
        o.material.roughness = 0.9;
      }
    }
  });
  if (src.clips?.length) {
    const mixer = new THREE.AnimationMixer(obj);
    const acts = {};
    src.clips.forEach(c => { acts[c.name] = mixer.clipAction(c); });
    const idle = acts.Idle || mixer.clipAction(src.clips[0]);
    idle.play();
    // desync every piece, or 32 figures breathe as one organism
    idle.time = Math.random() * idle.getClip().duration;
    mixer.timeScale = 0.85 + Math.random() * 0.3;
    mixers.push(mixer);
    obj.userData.mixer = mixer;
    obj.userData.acts = acts;
  }
  return obj;
}

function renderPieces() {
  mixers.length = 0;
  pieceGroup.clear();
  game.board().forEach((rank, row) => {
    rank.forEach((sq, f) => {
      if (!sq) return;
      const p = makePiece(sq.type, sq.color);
      // felt base — the side is legible even when the character art is busy
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.38, 0.05, 24),
        new THREE.MeshStandardMaterial({
          color: sq.color === 'w' ? 0xe9dcc0 : 0x241f1c, roughness: 0.9,
        }));
      base.position.y = 0.025;
      base.receiveShadow = true;
      p.add(base);
      p.position.copy(squareToPos(FILES[f] + (8 - row)));
      p.rotation.y = sq.color === 'w' ? 0 : Math.PI;
      p.userData.square = sq.square;
      pieceGroup.add(p);
    });
  });
}

// ---------- highlights ----------
const hlGroup = new THREE.Group();
scene.add(hlGroup);
const dotGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20);
const ringGeo = new THREE.TorusGeometry(0.44, 0.045, 10, 28);
function showHints() {
  hlGroup.clear();
  if (!selected) return;
  const sel = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf5c451 }));
  sel.position.copy(squareToPos(selected)).setY(0.02);
  sel.rotation.x = Math.PI / 2;
  hlGroup.add(sel);
  legal.forEach(m => {
    const isCap = m.flags.includes('c') || m.flags.includes('e');
    const mesh = new THREE.Mesh(isCap ? ringGeo : dotGeo,
      new THREE.MeshBasicMaterial({ color: isCap ? 0xd9603f : 0x6fbf7a, transparent: true, opacity: 0.9 }));
    mesh.position.copy(squareToPos(m.to)).setY(0.02);
    if (isCap) mesh.rotation.x = Math.PI / 2;
    hlGroup.add(mesh);
  });
}

// ---------- AI: minimax + alpha-beta ----------
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
// centre-preference table, applied to every piece; enough to stop aimless shuffling
const CENTRE = [
  0, 1, 2, 3, 3, 2, 1, 0, 1, 3, 4, 5, 5, 4, 3, 1, 2, 4, 6, 7, 7, 6, 4, 2, 3, 5, 7, 9, 9, 7, 5, 3,
  3, 5, 7, 9, 9, 7, 5, 3, 2, 4, 6, 7, 7, 6, 4, 2, 1, 3, 4, 5, 5, 4, 3, 1, 0, 1, 2, 3, 3, 2, 1, 0,
];

function evaluate(g) {
  if (g.isCheckmate()) return g.turn() === 'w' ? -Infinity : Infinity;
  if (g.isDraw()) return 0;
  let score = 0;
  g.board().forEach((rank, row) => {
    rank.forEach((sq, f) => {
      if (!sq) return;
      const v = VAL[sq.type] + CENTRE[row * 8 + f];
      score += sq.color === 'w' ? v : -v;
    });
  });
  return score;
}

function search(g, depth, alpha, beta, maximising) {
  if (depth === 0 || g.isGameOver()) return evaluate(g);
  const moves = g.moves({ verbose: true });
  // captures first — makes alpha-beta actually prune
  moves.sort((a, b) => (b.captured ? VAL[b.captured] : 0) - (a.captured ? VAL[a.captured] : 0));
  if (maximising) {
    let best = -Infinity;
    for (const m of moves) {
      g.move(m); best = Math.max(best, search(g, depth - 1, alpha, beta, false)); g.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    g.move(m); best = Math.min(best, search(g, depth - 1, alpha, beta, true)); g.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function bestMove(g, depth) {
  const maximising = g.turn() === 'w';
  const moves = g.moves({ verbose: true });
  moves.sort(() => Math.random() - 0.5); // vary equal-scoring openings
  let best = null, bestScore = maximising ? -Infinity : Infinity;
  for (const m of moves) {
    g.move(m);
    const s = search(g, depth - 1, -Infinity, Infinity, !maximising);
    g.undo();
    if (maximising ? s > bestScore : s < bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// ---------- interaction ----------
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let downAt = null;

renderer.domElement.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt) return;
  const drag = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (drag > 6) return; // orbiting, not clicking
  onClick(e);
});

function onClick(e) {
  if (busy || game.isGameOver() || game.turn() !== playerColor) return;
  ptr.x = (e.clientX / innerWidth) * 2 - 1;
  ptr.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(boardGroup.children, false)[0];
  if (!hit || !hit.object.userData.square) return;
  const sq = hit.object.userData.square;

  const target = legal.find(m => m.to === sq);
  if (target) return playMove(target);

  const piece = game.get(sq);
  if (piece && piece.color === playerColor) {
    selected = sq;
    legal = game.moves({ square: sq, verbose: true });
  } else {
    selected = null; legal = [];
  }
  showHints();
}

// walk the piece across the board instead of teleporting it
const travelling = [];
function walkPiece(from, to, done) {
  const piece = pieceGroup.children.find(p => p.userData.square === from);
  if (!piece) { done(); return; }
  const a = squareToPos(from), b = squareToPos(to);
  const acts = piece.userData.acts;
  const baseRot = piece.rotation.y;
  piece.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);   // face where it's going
  if (acts?.Walk) {
    acts.Walk.reset().play();
    acts.Idle?.crossFadeTo(acts.Walk, 0.15, false);
  }
  travelling.push({ piece, a, b, t: 0, dur: 0.5 + a.distanceTo(b) * 0.2, baseRot, acts, done });
}

function stepTravel(dt) {
  for (let i = travelling.length - 1; i >= 0; i--) {
    const w = travelling[i];
    w.t += dt;
    const k = Math.min(w.t / w.dur, 1);
    w.piece.position.lerpVectors(w.a, w.b, k);
    if (k >= 1) {
      if (w.acts?.Idle) {
        w.acts.Idle.reset().play();          // crossFadeTo needs the target already running
        w.acts.Walk?.crossFadeTo(w.acts.Idle, 0.2, false);
      }
      w.piece.rotation.y = w.baseRot;
      travelling.splice(i, 1);
      w.done();
    }
  }
}

function playMove(m) {
  busy = true;
  selected = null; legal = []; showHints();
  walkPiece(m.from, m.to, () => {
    game.move({ from: m.from, to: m.to, promotion: 'q' });
    renderPieces(); updateStatus();
    if (game.isGameOver()) { busy = false; updateStatus(); return; }
    setTimeout(() => {                       // let the DOM paint before the search blocks
      const reply = bestMove(game, aiDepth);
      if (!reply) { busy = false; updateStatus(); return; }
      walkPiece(reply.from, reply.to, () => {
        game.move(reply);
        busy = false;
        renderPieces(); updateStatus();
      });
    }, 60);
  });
}

// ---------- UI ----------
const statusEl = document.getElementById('status');
const capturedEl = document.getElementById('captured');
const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

function updateStatus() {
  let msg;
  if (game.isCheckmate()) msg = game.turn() === playerColor ? 'Checkmate — you lose' : 'Checkmate — you win';
  else if (game.isStalemate()) msg = 'Stalemate';
  else if (game.isDraw()) msg = 'Draw';
  else if (game.inCheck()) msg = game.turn() === playerColor ? 'You are in check' : 'Check';
  else if (busy) msg = 'Thinking…';
  else msg = game.turn() === playerColor ? 'Your move' : 'Thinking…';
  statusEl.textContent = msg;

  const caps = { w: [], b: [] };
  game.history({ verbose: true }).forEach(m => { if (m.captured) caps[m.color].push(GLYPH[m.captured]); });
  capturedEl.innerHTML =
    `<span class="ivory">${caps.w.join('')}</span><span class="obsidian">${caps.b.join('')}</span>`;
  document.getElementById('movecount').textContent = Math.ceil(game.history().length / 2) || 0;
}

document.querySelectorAll('[data-depth]').forEach(b => b.onclick = () => {
  aiDepth = +b.dataset.depth;
  document.querySelectorAll('[data-depth]').forEach(x => x.classList.toggle('on', x === b));
});
document.getElementById('restart').onclick = () => {
  game.reset(); selected = null; legal = []; busy = false;
  showHints(); renderPieces(); updateStatus();
};
document.getElementById('undo').onclick = () => {
  if (busy) return;
  game.undo(); game.undo();          // player move + AI reply
  selected = null; legal = []; showHints(); renderPieces(); updateStatus();
};

// ---------- boot ----------
const HEIGHT = { p: 0.78, r: 0.92, n: 0.95, b: 0.98, q: 1.05, k: 1.12 };

async function loadModels() {
  const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.170.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const manifest = await fetch('./pieces/manifest.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (!manifest) return;                       // no models yet → primitives
  await Promise.all(Object.entries(manifest).map(([type, file]) =>
    new Promise(res => loader.load('./pieces/' + file, g => {
      const o = g.scene;
      const box = new THREE.Box3().setFromObject(o);
      const s = HEIGHT[type] / box.getSize(new THREE.Vector3()).y;
      o.scale.setScalar(s);
      const b2 = new THREE.Box3().setFromObject(o);
      o.position.y -= b2.min.y;                                  // stand on the tile
      o.position.x -= (b2.min.x + b2.max.x) / 2;
      o.position.z -= (b2.min.z + b2.max.z) / 2;
      const wrap = new THREE.Group();
      wrap.add(o);
      MODELS[type] = { wrap, clips: g.animations };
      res();
    }, undefined, () => res())))
  );
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  mixers.forEach(m => m.update(dt));
  stepTravel(dt);
  controls.update();
  renderer.render(scene, camera);
});

await loadModels();
renderPieces();
updateStatus();
document.getElementById('boot').remove();
