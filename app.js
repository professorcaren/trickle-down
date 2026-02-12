const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusText = document.getElementById("statusText");
const adviceText = document.getElementById("adviceText");
const barsEl = document.getElementById("bars");
const pauseBtn = document.getElementById("pauseBtn");
const pausedActions = document.getElementById("pausedActions");
const resumeBtn = document.getElementById("resumeBtn");
const restartBtn = document.getElementById("restartBtn");
const pausedStats = document.getElementById("pausedStats");
const statsContent = document.getElementById("statsContent");
const pressMenu = document.getElementById("pressMenu");
const pressMenuTitle = document.getElementById("pressMenuTitle");
const pressMenuActions = document.getElementById("pressMenuActions");
const pressMenuCancel = document.getElementById("pressMenuCancel");
const timerText = document.getElementById("timerText");
const unlockBanner = document.getElementById("unlockBanner");
const wealthModeBtn = document.getElementById("wealthModeBtn");
const onboardingModal = document.getElementById("onboardingModal");
const onboardStep1 = document.getElementById("onboardStep1");
const onboardStep2 = document.getElementById("onboardStep2");
const onboardNext1 = document.getElementById("onboardNext1");
const onboardTryIt = document.getElementById("onboardTryIt");
const onboardBanner = document.getElementById("onboardBanner");

const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

// Size canvas to exactly fill its container on every device.
// W is always 1000 (internal game coordinates); H adapts to the screen shape.
const shellRect = canvas.parentElement.getBoundingClientRect();
canvas.width = 1000;
canvas.height = Math.round(1000 * shellRect.height / shellRect.width);

const W = canvas.width;
const H = canvas.height;
const BIN_HEIGHT = 200;
const PEG_RADIUS = 12;
const PARTICLE_RADIUS = 7;
const MAX_PARTICLES = 320;
const LEVER_HIT_RADIUS = isCoarsePointer ? 22 : 12;
const ENDPOINT_HIT_RADIUS = isCoarsePointer ? 24 : 14;
const PEG_HIT_RADIUS = isCoarsePointer ? 20 : 14;
const MIN_LEVER_LENGTH = isCoarsePointer ? 44 : 28;
const DRAG_START_DISTANCE = isCoarsePointer ? 9 : 6;
const LONG_PRESS_MS = isCoarsePointer ? 360 : 430;
const DEFAULT_GRAVITY = 1050;
const DEFAULT_SPAWN = isCoarsePointer ? 14 : 16;
const SCORE_WINDOW = 200;
const GAME_DURATION = 300; // 5 minutes in seconds
const ONBOARDING_DONE_KEY = "trickle_down_onboarding_done_v1";
const WEALTH_UNLOCKED_KEY = "trickle_down_wealth_unlocked_v1";

const colorGroups = {
  purple: { name: "Purple", label: "80-100%", hex: "#a855f7" },
  blue: { name: "Blue", label: "60-80%", hex: "#3b82f6" },
  green: { name: "Green", label: "40-60%", hex: "#22c55e" },
  red: { name: "Red", label: "20-40%", hex: "#ef4444" },
  orange: { name: "Orange", label: "0-20%", hex: "#f97316" },
};

const colorIds = Object.keys(colorGroups);
const binColorOrder = ["orange", "red", "green", "blue", "purple"];
const BIN_COUNT = binColorOrder.length;

// U.S. Census Bureau 2024: share of aggregate household income by quintile
const incomeTarget = { purple: 52, blue: 23, green: 14, red: 8, orange: 3 };
// Federal Reserve 2024: share of household wealth by quintile
const wealthTarget = { purple: 83, blue: 11, green: 4, red: 1, orange: 1 };

function getTarget() {
  return state.mode === "wealth" ? wealthTarget : incomeTarget;
}

function getModeLabel() {
  return state.mode === "wealth" ? "Wealth" : "Income";
}

const state = {
  mode: "income",
  gravity: DEFAULT_GRAVITY,
  spawnPerSec: DEFAULT_SPAWN,
  pegs: [],
  levers: [],
  particles: [],
  counts: Array.from({ length: BIN_COUNT }, () => 0),
  recentBins: [],
  totalCaptured: 0,
  spawnAccumulator: 0,
  draggingLever: null,
  draftLever: null,
  pointerInteraction: null,
  barRefs: {},
  activePointerId: null,
  menuContext: null,
  paused: false,
  // Timer
  elapsedTime: 0,
  timerActive: false,
  timeUp: false,
  // Wealth unlock
  wealthUnlocked: false,
  wealthUnlockShown: false,
  // Onboarding
  onboardingStep: 0, // 0=not started, 1=step1 showing, 2=step2 showing, 3=ghost lever, 4=done
  firstLeverDrawn: false,
  ghostLever: null,
  lastAdviceBucket: -1,
};

// localStorage helpers
function getOnboardingDone() {
  try { return window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1"; } catch { return false; }
}
function setOnboardingDone() {
  try { window.localStorage.setItem(ONBOARDING_DONE_KEY, "1"); } catch {}
}
function getWealthUnlocked() {
  try { return window.localStorage.getItem(WEALTH_UNLOCKED_KEY) === "1"; } catch { return false; }
}
function setWealthUnlocked() {
  try { window.localStorage.setItem(WEALTH_UNLOCKED_KEY, "1"); } catch {}
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const n = Number.parseInt(clean, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function initBars() {
  barsEl.innerHTML = `
    <div class="stack-row">
      <div class="stack-label">Current %</div>
      <div class="stack-track" id="currentTrack"></div>
    </div>
    <div class="stack-legend" id="stackLegend"></div>
  `;

  barsEl.querySelector("#stackLegend").innerHTML = binColorOrder
    .map(
      (colorId) =>
        `<span class="legend-item"><span class="swatch" style="background:${colorGroups[colorId].hex}"></span>${colorGroups[colorId].label}</span>`
    )
    .join("");

  state.barRefs = {
    currentTrack: barsEl.querySelector("#currentTrack"),
  };
}

function renderStackRow(trackEl, valuesByColor, titlePrefix) {
  trackEl.innerHTML = "";
  binColorOrder.forEach((colorId) => {
    const pct = Math.max(0, valuesByColor[colorId] || 0);
    const seg = document.createElement("span");
    seg.className = "stack-segment";
    seg.style.width = `${pct}%`;
    seg.style.background = colorGroups[colorId].hex;
    seg.title = `${titlePrefix} ${colorGroups[colorId].label}: ${pct.toFixed(1)}%`;
    trackEl.appendChild(seg);
  });
}

function resetCounts() {
  state.counts = Array.from({ length: BIN_COUNT }, () => 0);
  state.recentBins = [];
  const basePerBin = Math.floor(SCORE_WINDOW / BIN_COUNT);
  const remainder = SCORE_WINDOW % BIN_COUNT;

  // Seed a neutral rolling window so the system starts from an even baseline.
  for (let round = 0; round < basePerBin; round += 1) {
    for (let idx = 0; idx < BIN_COUNT; idx += 1) {
      state.recentBins.push(idx);
      state.counts[idx] += 1;
    }
  }
  for (let idx = 0; idx < remainder; idx += 1) {
    state.recentBins.push(idx);
    state.counts[idx] += 1;
  }

  state.totalCaptured = 0;
}

function seedBoard() {
  state.pegs = [];
  state.levers = [];

  const startY = 80;
  const rowGap = 68;
  const colGap = 86;
  const maxY = H - BIN_HEIGHT - 24;
  for (let row = 0; startY + row * rowGap < maxY; row += 1) {
    const y = startY + row * rowGap;
    const offset = row % 2 === 0 ? 72 : 114;
    for (let x = offset; x < W - 56; x += colGap) {
      state.pegs.push({ x, y, r: PEG_RADIUS });
    }
  }
}

function getPointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function clampBoardPoint(x, y) {
  return {
    x: Math.max(8, Math.min(W - 8, x)),
    y: Math.max(28, Math.min(H - BIN_HEIGHT - 12, y)),
  };
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function getLeverHit(x, y) {
  for (let i = state.levers.length - 1; i >= 0; i -= 1) {
    const lever = state.levers[i];
    const d1 = Math.hypot(x - lever.x1, y - lever.y1);
    if (d1 <= ENDPOINT_HIT_RADIUS) return { index: i, part: "end1" };
    const d2 = Math.hypot(x - lever.x2, y - lever.y2);
    if (d2 <= ENDPOINT_HIT_RADIUS) return { index: i, part: "end2" };
    if (distancePointToSegment(x, y, lever.x1, lever.y1, lever.x2, lever.y2) <= LEVER_HIT_RADIUS) {
      return { index: i, part: "body" };
    }
  }
  return null;
}

function getPegHitIndex(x, y, threshold = PEG_HIT_RADIUS) {
  for (let i = state.pegs.length - 1; i >= 0; i -= 1) {
    const peg = state.pegs[i];
    if (Math.hypot(x - peg.x, y - peg.y) <= threshold) return i;
  }
  return -1;
}

function addPeg(x, y) {
  if (y > H - BIN_HEIGHT - 22) return;
  const p = clampBoardPoint(x, y);
  for (const peg of state.pegs) {
    if (Math.hypot(p.x - peg.x, p.y - peg.y) < PEG_RADIUS * 2 + 2) return;
  }
  state.pegs.push({ x: p.x, y: p.y, r: PEG_RADIUS });
}

function addLever(x1, y1, x2, y2) {
  const a = clampBoardPoint(x1, y1);
  const b = clampBoardPoint(x2, y2);
  if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_LEVER_LENGTH) return;
  state.levers.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: 8 });
}

function addDefaultLeverAt(x, y) {
  const center = clampBoardPoint(x, y);
  const halfLen = isCoarsePointer ? 52 : 45;
  const angle = (Math.random() - 0.5) * 1.1;
  const dx = Math.cos(angle) * halfLen;
  const dy = Math.sin(angle) * halfLen;
  addLever(center.x - dx, center.y - dy, center.x + dx, center.y + dy);
}

function hidePressMenu() {
  pressMenu.hidden = true;
  state.menuContext = null;
}

function resetMenuSheetPosition() {
  const sheet = pressMenu.querySelector(".press-menu-sheet");
  sheet.style.position = "";
  sheet.style.left = "";
  sheet.style.top = "";
  sheet.style.width = "";
  sheet.style.margin = "0 auto";
}

function buildMenuActions(context) {
  if (context.leverIndex >= 0) return [{ id: "delete-lever", label: "Delete Lever" }];
  if (context.pegIndex >= 0) return [{ id: "delete-peg", label: "Delete Peg" }];
  return [
    { id: "add-peg", label: "Add Peg Here" },
    { id: "add-lever", label: "Add Lever Here" },
  ];
}

function openMenu(context, title, clientX, clientY) {
  state.menuContext = context;
  pressMenuTitle.textContent = title;

  const actions = buildMenuActions(context);
  pressMenuActions.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action.id;
    button.textContent = action.label;
    if (action.id.startsWith("delete")) button.style.background = "#fee2e2";
    pressMenuActions.appendChild(button);
  });

  pressMenu.hidden = false;

  if (!isCoarsePointer && typeof clientX === "number" && typeof clientY === "number") {
    const sheet = pressMenu.querySelector(".press-menu-sheet");
    const x = Math.max(14, Math.min(window.innerWidth - 340, clientX - 140));
    const y = Math.max(14, Math.min(window.innerHeight - 230, clientY - 30));
    sheet.style.margin = "0";
    sheet.style.position = "absolute";
    sheet.style.left = `${x}px`;
    sheet.style.top = `${y}px`;
    sheet.style.width = "320px";
  }
}

function openBoardPointMenu(clientX, clientY, boardX, boardY, leverIndex, pegIndex) {
  const onObject = leverIndex >= 0 || pegIndex >= 0;
  const context = {
    kind: "board-point",
    x: boardX,
    y: boardY,
    leverIndex,
    pegIndex,
  };
  openMenu(context, onObject ? "Object Actions" : "Board Actions", clientX, clientY);
}

function applyMenuAction(actionId) {
  if (!state.menuContext) return;
  const context = state.menuContext;

  if (context.kind !== "board-point") return;
  if (actionId === "add-peg") addPeg(context.x, context.y);
  if (actionId === "add-lever") addDefaultLeverAt(context.x, context.y);
  if (actionId === "delete-lever" && context.leverIndex >= 0) state.levers.splice(context.leverIndex, 1);
  if (actionId === "delete-peg" && context.pegIndex >= 0) state.pegs.splice(context.pegIndex, 1);
}

function startLeverDrag(hit, startX, startY) {
  state.draggingLever = {
    index: hit.index,
    mode: hit.part === "body" ? "move" : hit.part,
    lastX: startX,
    lastY: startY,
  };
  if (!isCoarsePointer) {
    canvas.style.cursor = state.draggingLever.mode === "move" ? "grabbing" : "crosshair";
  }
}

function updateLeverDrag(pointerX, pointerY) {
  if (!state.draggingLever) return;
  const drag = state.draggingLever;
  const lever = state.levers[drag.index];
  if (!lever) {
    state.draggingLever = null;
    return;
  }

  if (drag.mode === "move") {
    const dx = pointerX - drag.lastX;
    const dy = pointerY - drag.lastY;

    lever.x1 += dx;
    lever.y1 += dy;
    lever.x2 += dx;
    lever.y2 += dy;

    const a = clampBoardPoint(lever.x1, lever.y1);
    const b = clampBoardPoint(lever.x2, lever.y2);
    lever.x1 = a.x;
    lever.y1 = a.y;
    lever.x2 = b.x;
    lever.y2 = b.y;

    drag.lastX = pointerX;
    drag.lastY = pointerY;
    return;
  }

  const point = clampBoardPoint(pointerX, pointerY);
  const fixed = drag.mode === "end1" ? { x: lever.x2, y: lever.y2 } : { x: lever.x1, y: lever.y1 };
  let dx = point.x - fixed.x;
  let dy = point.y - fixed.y;
  let dist = Math.hypot(dx, dy);

  if (dist < MIN_LEVER_LENGTH) {
    if (dist < 0.001) {
      const fallbackX = drag.mode === "end1" ? lever.x1 - lever.x2 : lever.x2 - lever.x1;
      const fallbackY = drag.mode === "end1" ? lever.y1 - lever.y2 : lever.y2 - lever.y1;
      dx = fallbackX;
      dy = fallbackY;
      dist = Math.hypot(dx, dy) || 1;
    }
    const scale = MIN_LEVER_LENGTH / dist;
    dx *= scale;
    dy *= scale;
  }

  const endPoint = clampBoardPoint(fixed.x + dx, fixed.y + dy);
  if (drag.mode === "end1") {
    lever.x1 = endPoint.x;
    lever.y1 = endPoint.y;
  } else {
    lever.x2 = endPoint.x;
    lever.y2 = endPoint.y;
  }

  drag.lastX = pointerX;
  drag.lastY = pointerY;
}

function releaseActivePointer(pointerId) {
  if (pointerId != null && canvas.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId);
  }
  state.activePointerId = null;
  state.pointerInteraction = null;
  state.draggingLever = null;
  state.draftLever = null;
  if (!isCoarsePointer) canvas.style.cursor = "default";
}

function spawnParticle() {
  if (state.particles.length >= MAX_PARTICLES) return;
  const x = PARTICLE_RADIUS + Math.random() * (W - PARTICLE_RADIUS * 2);
  state.particles.push({
    x,
    y: -10,
    vx: (Math.random() - 0.5) * 24,
    vy: 30 + Math.random() * 20,
    r: PARTICLE_RADIUS,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 3.5,
  });
}

function collideCircle(particle, cx, cy, cr, bounce = 0.7) {
  let dx = particle.x - cx;
  let dy = particle.y - cy;
  let dist = Math.hypot(dx, dy);
  const minDist = particle.r + cr;
  if (dist >= minDist) return;
  if (dist === 0) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  particle.x = cx + nx * minDist;
  particle.y = cy + ny * minDist;
  const vn = particle.vx * nx + particle.vy * ny;
  if (vn < 0) {
    particle.vx -= (1 + bounce) * vn * nx;
    particle.vy -= (1 + bounce) * vn * ny;
  }
}

function collideLever(particle, lever) {
  const dx = lever.x2 - lever.x1;
  const dy = lever.y2 - lever.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return;
  const t = Math.max(0, Math.min(1, ((particle.x - lever.x1) * dx + (particle.y - lever.y1) * dy) / lengthSquared));
  const cx = lever.x1 + t * dx;
  const cy = lever.y1 + t * dy;
  let nx = particle.x - cx;
  let ny = particle.y - cy;
  let dist = Math.hypot(nx, ny);
  const minDist = particle.r + lever.t * 0.5;
  if (dist >= minDist) return;
  if (dist === 0) {
    nx = -dy;
    ny = dx;
    dist = Math.hypot(nx, ny);
  }
  nx /= dist;
  ny /= dist;
  particle.x = cx + nx * minDist;
  particle.y = cy + ny * minDist;

  const vn = particle.vx * nx + particle.vy * ny;
  if (vn < 0) {
    particle.vx -= (1 + 0.66) * vn * nx;
    particle.vy -= (1 + 0.66) * vn * ny;
  }
}

function captureInBin(particle) {
  const binWidth = W / BIN_COUNT;
  const idx = Math.max(0, Math.min(BIN_COUNT - 1, Math.floor(particle.x / binWidth)));
  state.recentBins.push(idx);
  state.counts[idx] += 1;
  if (state.recentBins.length > SCORE_WINDOW) {
    const dropped = state.recentBins.shift();
    if (typeof dropped === "number") {
      state.counts[dropped] = Math.max(0, state.counts[dropped] - 1);
    }
  }
  state.totalCaptured += 1;
}

function getCurrentByColor() {
  const countsByColor = Object.fromEntries(colorIds.map((id) => [id, 0]));
  for (let i = 0; i < BIN_COUNT; i += 1) {
    countsByColor[binColorOrder[i]] += state.counts[i];
  }
  const windowCount = state.recentBins.length;
  return Object.fromEntries(
    colorIds.map((id) => [id, windowCount === 0 ? 0 : (countsByColor[id] / windowCount) * 100])
  );
}

function computeMetrics() {
  const currentByColor = getCurrentByColor();
  const windowCount = state.recentBins.length;
  const t = getTarget();

  const totalAbsError = colorIds.reduce(
    (sum, colorId) => sum + Math.abs(currentByColor[colorId] - t[colorId]),
    0
  );

  // Wealth mode is much harder — score more generously
  const penalty = state.mode === "wealth" ? 0.55 : 0.85;
  const score = windowCount === 0 ? 0 : Math.max(0, Math.round(100 - totalAbsError * penalty));

  return {
    currentByColor,
    targetByColor: t,
    score,
    windowCount,
  };
}

function getScoreMessage(score, cur) {
  const t = getTarget();
  const isWealth = state.mode === "wealth";

  if (score >= 97) return isWealth ? "Nailed it! That's how skewed wealth really is." : "Nailed it! That's America.";
  if (score >= 94) return "Almost perfect \u2014 tiny tweaks!";
  if (score >= 90) return isWealth ? "Impressive! You get how extreme wealth concentration is." : "Impressive! You really get inequality.";
  if (score >= 88) return "Dialed in \u2014 just a nudge or two off.";

  const topDiff = cur.purple - t.purple;
  const upperDiff = cur.blue - t.blue;
  const midDiff = cur.green - t.green;
  const lowerDiff = cur.red - t.red;
  const bottomDiff = cur.orange - t.orange;
  const bottomHalf = cur.orange + cur.red;
  const topHalf = cur.purple + cur.blue;
  const bottomThree = cur.orange + cur.red + cur.green;

  if (isWealth) {
    if (score >= 78) {
      if (topDiff < -5) return "Almost! Even more needs to pool at the very top.";
      if (topDiff > 5) return "Close, but even the top quintile doesn't hoard that much.";
      if (bottomThree > 12) return "Nearly there \u2014 the bottom gets almost nothing.";
      return "So close! Fine-tune your levers.";
    }
    if (score >= 60) {
      if (topDiff < -15) return "Way more needs to go to the top. Send it right!";
      if (topDiff < -8) return "Not enough pooling at the top \u2014 wealth is super concentrated.";
      if (bottomThree > 25) return "Way too much going to the bottom \u2014 shrink those brackets.";
      if (midDiff > 8) return "The middle class has almost no wealth \u2014 shrink that bracket.";
      if (cur.orange > 5) return "The bottom is getting too much. Way too generous.";
      return "Getting there \u2014 pause and check which brackets are off.";
    }
    if (score >= 40) {
      if (topDiff < -30) return "The top needs way, way more. That's not a joke.";
      if (Math.abs(cur.purple - 20) < 8) return "Way too equal! Wealth is wildly more concentrated than income.";
      if (bottomHalf > 20) return "The bottom gets almost nothing. Not that much.";
      if (cur.orange > 10) return "The bottom quintile has virtually nothing. Really.";
      if (cur.purple > 92) return "Even the real numbers aren't quite that extreme!";
      return "Big gaps \u2014 try angling levers to push almost everything right.";
    }
    if (cur.purple < 40) return "The top quintile needs way more than that.";
    if (bottomThree > 40) return "The bottom three quintiles are getting way too much.";
    if (state.levers.length === 0 && state.totalCaptured > 20) return "Try drawing some levers to redirect the flow!";
    return "Wealth is even more lopsided than income \u2014 keep experimenting!";
  }

  // Income mode messages
  if (score >= 78) {
    if (topDiff < -5) return "Almost! The top quintile needs a bigger slice.";
    if (topDiff > 5) return "Close, but too much is pooling at the top.";
    if (bottomDiff > 4) return "The bottom is getting more than reality allows.";
    if (midDiff > 4) return "Nearly there \u2014 the middle class is a touch too big.";
    if (upperDiff > 5) return "The upper-middle bracket is a bit bloated.";
    if (lowerDiff > 4) return "Trim the lower-middle bracket a little.";
    return "So close! Fine-tune your levers.";
  }

  if (score >= 60) {
    if (topDiff < -12) return "The top needs way more. Send it right!";
    if (topDiff < -8) return "Not enough reaching the wealthiest quintile.";
    if (bottomHalf > 30) return "Too much at the bottom \u2014 reality is harsher.";
    if (midDiff > 10) return "Middle class is too big. Sounds nice, but nope.";
    if (topDiff > 10) return "Even the real economy isn't that top-heavy!";
    if (upperDiff > 10) return "The upper-middle range is grabbing too much.";
    if (bottomThree > 40) return "Bottom three quintiles are way over budget.";
    return "Getting there \u2014 pause and check which quintiles are off.";
  }

  if (score >= 40) {
    if (topDiff < -20) return "The rich aren't rich enough yet. Seriously.";
    if (Math.abs(cur.purple - 20) < 5 && Math.abs(cur.orange - 20) < 5) return "Too equal! The real world is way less fair.";
    if (bottomHalf > 40) return "Way too much going to the bottom.";
    if (midDiff > 15) return "That's a massive middle class \u2014 not how it works.";
    if (cur.orange > 15) return "The bottom is getting way too much. Wishful thinking.";
    if (topHalf > 90) return "Whoa \u2014 you built an oligarchy, not the U.S.";
    if (cur.purple > 70) return "Too much at the top \u2014 even America isn't there yet.";
    return "Big gaps \u2014 try angling some levers.";
  }

  if (topHalf < 30) return "Almost nothing reaches the top. Funnel it right!";
  if (bottomHalf > 50) return "Way too much to the bottom. If only!";
  if (bottomThree > 70) return "Bottom three quintiles are way too high. That's a dream.";
  if (cur.purple < 10) return "Top quintile is way too low. That's never happened.";
  if (cur.orange > 25) return "Bottom quintile is way too high. Different country!";
  if (state.levers.length === 0 && state.totalCaptured > 20) return "Try drawing some levers to redirect the flow!";
  if (Math.abs(topDiff) < 8 && bottomHalf > 35) return "Top is okay but the bottom gets way too much.";
  return "Wild distribution \u2014 keep experimenting!";
}

function getScoreColor(score) {
  if (score >= 88) return "#16a34a";
  if (score >= 72) return "#0ea5e9";
  if (score >= 45) return "#f59e0b";
  return "#ef4444";
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function updateTimerDisplay() {
  const remaining = Math.max(0, GAME_DURATION - state.elapsedTime);
  timerText.textContent = formatTime(remaining);
  if (remaining < 60) {
    timerText.classList.add("timer-warning");
  } else {
    timerText.classList.remove("timer-warning");
  }
}

function showUnlockBanner() {
  if (state.wealthUnlockShown) return;
  state.wealthUnlockShown = true;
  unlockBanner.hidden = false;
  wealthModeBtn.hidden = false;
  setTimeout(() => { unlockBanner.hidden = true; }, 5000);
}

function updateHud() {
  const metrics = computeMetrics();
  renderStackRow(state.barRefs.currentTrack, metrics.currentByColor, "Current");
  const prefix = state.mode === "wealth" ? "Wealth" : "Score";
  statusText.textContent = `${prefix}: ${metrics.score}`;
  statusText.style.color = getScoreColor(metrics.score);

  // Only update advice when the score crosses a multiple-of-5 boundary
  const bucket = Math.floor(metrics.score / 5);
  if (bucket !== state.lastAdviceBucket) {
    state.lastAdviceBucket = bucket;
    adviceText.textContent = getScoreMessage(metrics.score, metrics.currentByColor);
  }
  updateTimerDisplay();

  // Wealth unlock detection
  if (!state.wealthUnlocked && state.mode === "income" && metrics.score >= 85) {
    state.wealthUnlocked = true;
    setWealthUnlocked();
    showUnlockBanner();
  }

  // Show wealth button if already unlocked
  if (state.wealthUnlocked && !state.timeUp) {
    wealthModeBtn.hidden = false;
  }
}

function update(dt) {
  state.spawnAccumulator += state.spawnPerSec * dt;
  while (state.spawnAccumulator >= 1) {
    spawnParticle();
    state.spawnAccumulator -= 1;
    if (state.particles.length >= MAX_PARTICLES) {
      state.spawnAccumulator = 0;
      break;
    }
  }

  const binWidth = W / BIN_COUNT;
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.vy += state.gravity * dt;
    p.vx *= 0.999;
    p.rot += p.rotV * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < p.r) {
      p.x = p.r;
      p.vx = Math.abs(p.vx) * 0.72;
    } else if (p.x > W - p.r) {
      p.x = W - p.r;
      p.vx = -Math.abs(p.vx) * 0.72;
    }

    if (p.y < p.r) {
      p.y = p.r;
      p.vy = Math.abs(p.vy) * 0.72;
    }

    for (const peg of state.pegs) collideCircle(p, peg.x, peg.y, peg.r, 0.68);
    for (const lever of state.levers) collideLever(p, lever);

    if (p.y >= H - BIN_HEIGHT && p.vy > 0) {
      captureInBin(p);
      state.particles.splice(i, 1);
      continue;
    }
  }
}

const bgCache = document.createElement("canvas");
bgCache.width = W;
bgCache.height = H;
(function renderBgCache() {
  const bg = bgCache.getContext("2d");
  const gradient = bg.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#f8fafc");
  gradient.addColorStop(1, "#e2e8f0");
  bg.fillStyle = gradient;
  bg.fillRect(0, 0, W, H);

  bg.globalAlpha = 0.05;
  bg.fillStyle = "#6366f1";
  for (let x = 0; x <= W; x += 22) {
    for (let y = 0; y <= H - BIN_HEIGHT; y += 22) {
      bg.beginPath();
      bg.arc(x + (y % 11), y, 1.4, 0, Math.PI * 2);
      bg.fill();
    }
  }
})();

function drawBackground() {
  ctx.drawImage(bgCache, 0, 0);
}

function drawBins() {
  const binWidth = W / BIN_COUNT;
  const yTop = H - BIN_HEIGHT;

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fillRect(0, yTop, W, BIN_HEIGHT);

  for (let i = 0; i < BIN_COUNT; i += 1) {
    const colorId = binColorOrder[i];
    ctx.fillStyle = hexToRgba(colorGroups[colorId].hex, 0.38);
    ctx.fillRect(i * binWidth, yTop, binWidth, BIN_HEIGHT);
  }

  // Quintile labels at top of each bin
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "bold 24px Chivo";
  for (let i = 0; i < BIN_COUNT; i += 1) {
    const colorId = binColorOrder[i];
    const cx = i * binWidth + binWidth / 2;
    ctx.fillStyle = hexToRgba(colorGroups[colorId].hex, 0.7);
    ctx.fillText(colorGroups[colorId].label, cx, yTop + 8);
  }

  // Bin dividers
  ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";
  ctx.lineWidth = 3;
  for (let i = 1; i < BIN_COUNT; i += 1) {
    const x = i * binWidth;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Top line separating play area from bins
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
  ctx.beginPath();
  ctx.moveTo(0, yTop);
  ctx.lineTo(W, yTop);
  ctx.stroke();

  // Bottom line
  ctx.beginPath();
  ctx.moveTo(0, H - 2);
  ctx.lineTo(W, H - 2);
  ctx.stroke();
}

function drawPegs() {
  for (const peg of state.pegs) {
    ctx.beginPath();
    ctx.fillStyle = "#6366f1";
    ctx.strokeStyle = "#4338ca";
    ctx.lineWidth = 2;
    ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawLevers() {
  for (let i = 0; i < state.levers.length; i += 1) {
    const lever = state.levers[i];
    const active = state.draggingLever && state.draggingLever.index === i;
    ctx.strokeStyle = active ? "#f59e0b" : "#0ea5e9";
    ctx.lineWidth = lever.t;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lever.x1, lever.y1);
    ctx.lineTo(lever.x2, lever.y2);
    ctx.stroke();

    ctx.fillStyle = active ? "#f59e0b" : "#0369a1";
    ctx.beginPath();
    ctx.arc(lever.x1, lever.y1, active ? 5 : 4, 0, Math.PI * 2);
    ctx.arc(lever.x2, lever.y2, active ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.draftLever) {
    ctx.strokeStyle = "rgba(14, 165, 233, 0.6)";
    ctx.lineWidth = 5;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(state.draftLever.x1, state.draftLever.y1);
    ctx.lineTo(state.draftLever.x2, state.draftLever.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawGhostLever(now) {
  if (!state.ghostLever) return;
  const gl = state.ghostLever;
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin(now / 600));
  ctx.save();
  ctx.strokeStyle = `rgba(0, 224, 255, ${pulse})`;
  ctx.lineWidth = 6;
  ctx.setLineDash([12, 8]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(gl.x1, gl.y1);
  ctx.lineTo(gl.x2, gl.y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // "Draw here" label
  const mx = (gl.x1 + gl.x2) / 2;
  const my = (gl.y1 + gl.y2) / 2 - 22;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px Baloo 2";
  ctx.fillStyle = `rgba(0, 224, 255, ${pulse})`;
  ctx.fillText("Draw here", mx, my);
  ctx.restore();
}

function drawParticles() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 48px Chivo";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  for (const p of state.particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeText("$", 0, 2);
    ctx.fillStyle = "#16a34a";
    ctx.fillText("$", 0, 2);
    ctx.restore();
  }
}

function drawBinStack() {
  const binWidth = W / BIN_COUNT;
  const spacing = 22;
  const cols = Math.floor((binWidth - 8) / spacing);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 32px Chivo";

  // Scale visual count so bins start empty and fill as real balls arrive
  const visualTotal = Math.min(state.totalCaptured, SCORE_WINDOW);
  const countTotal = state.recentBins.length;
  for (let i = 0; i < BIN_COUNT; i += 1) {
    const count = countTotal > 0 ? Math.round(state.counts[i] * visualTotal / countTotal) : 0;
    if (count === 0) continue;
    const colorId = binColorOrder[i];
    ctx.fillStyle = colorGroups[colorId].hex;
    const binLeft = i * binWidth + (binWidth - cols * spacing) / 2;

    for (let j = 0; j < count; j += 1) {
      const col = j % cols;
      const row = Math.floor(j / cols);
      const x = binLeft + col * spacing + spacing / 2;
      const y = H - 14 - row * spacing;
      if (y < H - BIN_HEIGHT + 38) break;
      ctx.fillText("$", x, y);
    }
  }
}

function draw(now) {
  drawBackground();
  drawBins();
  drawBinStack();
  drawPegs();
  drawLevers();
  drawGhostLever(now);
  drawParticles();
}

// Onboarding
function startOnboarding() {
  state.onboardingStep = 1;
  onboardStep1.hidden = false;
  onboardStep2.hidden = true;
  onboardingModal.hidden = false;
}

function showOnboardStep2() {
  state.onboardingStep = 2;
  onboardStep1.hidden = true;
  onboardStep2.hidden = false;
}

function closeOnboardingModal() {
  onboardingModal.hidden = true;
}

function activateGhostLever() {
  state.onboardingStep = 3;
  closeOnboardingModal();
  // Place ghost lever in upper-right area
  const gx1 = W * 0.55;
  const gy1 = H * 0.18;
  const gx2 = W * 0.75;
  const gy2 = H * 0.25;
  state.ghostLever = { x1: gx1, y1: gy1, x2: gx2, y2: gy2 };
}

function onFirstLeverDrawn() {
  if (state.firstLeverDrawn) return;
  state.firstLeverDrawn = true;
  state.ghostLever = null;
  state.onboardingStep = 4;
  setOnboardingDone();

  // Show step 3 banner
  onboardBanner.textContent = "Nice! Watch your score below. Get it above 85 to understand the shape of inequality.";
  onboardBanner.hidden = false;
  setTimeout(() => { onboardBanner.hidden = true; }, 5000);

  // Start the timer now
  state.timerActive = true;
}

onboardNext1.addEventListener("click", showOnboardStep2);
onboardTryIt.addEventListener("click", activateGhostLever);

// Pause stats with sociological content
function renderPausedStats() {
  const metrics = computeMetrics();
  const modeLabel = getModeLabel();
  let html = '<div class="stats-card">';

  if (state.timeUp) {
    html += '<p class="time-up-banner">Time\'s up!</p>';
  }

  html += `<p class="stats-mode-label">Mode: U.S. ${modeLabel} Distribution</p>`;
  html += '<div class="stats-grid">';
  html += '<div class="stats-header"><span>Quintile</span><span>Current</span><span>Target</span><span>Diff</span></div>';
  binColorOrder.forEach((colorId) => {
    const current = metrics.currentByColor[colorId];
    const swatch = `<span class="swatch" style="background:${colorGroups[colorId].hex}"></span>`;
    const t = metrics.targetByColor[colorId];
    const diff = current - t;
    const sign = diff >= 0 ? "+" : "";
    const diffClass = diff > 0.5 ? "over" : diff < -0.5 ? "under" : "close";
    html += `<div class="stats-row"><span class="stats-color">${swatch}${colorGroups[colorId].label}</span><span class="stats-current">${current.toFixed(1)}%</span><span class="stats-target">${t}%</span><span class="stats-diff ${diffClass}">${sign}${diff.toFixed(1)}</span></div>`;
  });
  html += "</div>";
  html += `<p class="stats-score">Score: ${metrics.score}/100</p>`;
  html += `<p class="stats-note">Based on last ${metrics.windowCount} balls</p>`;

  // Wealth mode switch in pause overlay
  if (state.wealthUnlocked) {
    const switchLabel = state.mode === "income" ? "Switch to Wealth Mode" : "Switch to Income Mode";
    html += `<button id="statsWealthSwitch" class="stats-wealth-switch">${switchLabel}</button>`;
  }

  // Sociological explainer
  html += '<details class="stats-explainer"><summary>Think About It</summary>';
  html += '<p class="explainer-intro">Without levers, dollars split roughly equally. Every lever you add is a structural force pushing money toward one group. Sound familiar?</p>';
  html += '<ul class="explainer-list">';
  html += '<li><strong>Top levers</strong> &mdash; Legacy advantages: family wealth, zip code, connections at birth. Small early nudges that compound over a lifetime.</li>';
  html += '<li><strong>Middle levers</strong> &mdash; Institutional channels: school funding, hiring networks, tax policy. The invisible pipelines that move money upward.</li>';
  html += '<li><strong>Bottom levers</strong> &mdash; Sorting gates: who gets into which bin at the end. Predatory lending, medical debt, and housing costs keep the bottom locked out, while winner-take-more dynamics tip the upper-middle into the top.</li>';
  html += '</ul>';
  html += '<p class="explainer-intro">Notice how many levers it takes to recreate real inequality. The &ldquo;fair&rdquo; baseline &mdash; no levers &mdash; is an equal split. Every lever is a policy choice.</p>';
  html += '</details>';

  html += "</div>";
  statsContent.innerHTML = html;

  // Wealth switch handler in pause overlay
  const statsSwitch = statsContent.querySelector("#statsWealthSwitch");
  if (statsSwitch) {
    statsSwitch.addEventListener("click", () => {
      switchMode();
      renderPausedStats();
    });
  }
}

function switchMode() {
  state.mode = state.mode === "income" ? "wealth" : "income";
  resetCounts();
  state.particles = [];
  state.lastAdviceBucket = -1;
  updateWealthModeBtn();
}

function updateWealthModeBtn() {
  if (!state.wealthUnlocked) {
    wealthModeBtn.hidden = true;
    return;
  }
  const label = state.mode === "income" ? "Switch to Wealth Mode" : "Switch to Income Mode";
  wealthModeBtn.textContent = label;
  wealthModeBtn.hidden = state.timeUp;
}

function setPaused(paused) {
  state.paused = paused;
  if (state.paused) {
    pauseBtn.hidden = true;
    pausedActions.hidden = false;
    pausedStats.hidden = false;
    wealthModeBtn.hidden = true;
    renderPausedStats();
  } else {
    pauseBtn.hidden = false;
    pausedActions.hidden = true;
    pausedStats.hidden = true;
    updateWealthModeBtn();
  }
}

function restart() {
  seedBoard();
  resetCounts();
  state.particles = [];
  state.elapsedTime = 0;
  state.timeUp = false;
  state.timerActive = true;
  state.mode = "income";
  state.lastAdviceBucket = -1;
  updateWealthModeBtn();
  setPaused(false);
}

let lastTime = performance.now();
let hudTimer = 0;
function animate(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000);
  lastTime = now;

  if (!state.paused) {
    update(dt);
    // Timer
    if (state.timerActive && !state.timeUp) {
      state.elapsedTime += dt;
      if (state.elapsedTime >= GAME_DURATION) {
        state.elapsedTime = GAME_DURATION;
        state.timeUp = true;
        setPaused(true);
      }
    }
  }
  draw(now);
  hudTimer += dt;
  if (hudTimer > 0.09) {
    updateHud();
    hudTimer = 0;
  }
  requestAnimationFrame(animate);
}

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const p = getPointerPos(event);
  const leverHit = getLeverHit(p.x, p.y);
  const pegIndex = leverHit ? -1 : getPegHitIndex(p.x, p.y);
  resetMenuSheetPosition();
  openBoardPointMenu(event.clientX, event.clientY, p.x, p.y, leverHit ? leverHit.index : -1, pegIndex);
});

canvas.addEventListener("pointerdown", (event) => {
  hidePressMenu();
  resetMenuSheetPosition();

  if (event.button !== 0) return;
  if (state.activePointerId !== null && state.activePointerId !== event.pointerId) return;

  const p = getPointerPos(event);
  const leverHit = getLeverHit(p.x, p.y);
  const pegIndex = leverHit ? -1 : getPegHitIndex(p.x, p.y);

  state.activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  state.pointerInteraction = {
    pointerId: event.pointerId,
    startX: p.x,
    startY: p.y,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
    downAt: performance.now(),
    leverHit,
    pegIndex,
  };
});

canvas.addEventListener("pointermove", (event) => {
  if (state.activePointerId === null && !isCoarsePointer) {
    const p = getPointerPos(event);
    const hoverHit = getLeverHit(p.x, p.y);
    if (!hoverHit) {
      canvas.style.cursor = "default";
    } else if (hoverHit.part === "body") {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "crosshair";
    }
    return;
  }

  if (state.activePointerId !== event.pointerId) return;
  const interaction = state.pointerInteraction;
  if (!interaction) return;

  const p = getPointerPos(event);
  const movedPx = Math.hypot(p.x - interaction.startX, p.y - interaction.startY);

  if (!interaction.moved && movedPx >= DRAG_START_DISTANCE) {
    interaction.moved = true;
    if (interaction.leverHit) {
      startLeverDrag(interaction.leverHit, p.x, p.y);
    } else if (interaction.pegIndex < 0) {
      const start = clampBoardPoint(interaction.startX, interaction.startY);
      const end = clampBoardPoint(p.x, p.y);
      state.draftLever = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }
  }

  if (state.draggingLever) {
    updateLeverDrag(p.x, p.y);
  } else if (state.draftLever) {
    const point = clampBoardPoint(p.x, p.y);
    state.draftLever.x2 = point.x;
    state.draftLever.y2 = point.y;
  }
});

function onPointerRelease(event) {
  if (state.activePointerId !== event.pointerId) return;

  const interaction = state.pointerInteraction;
  const duration = interaction ? performance.now() - interaction.downAt : 0;

  if (state.draftLever) {
    const beforeCount = state.levers.length;
    addLever(state.draftLever.x1, state.draftLever.y1, state.draftLever.x2, state.draftLever.y2);
    state.draftLever = null;

    // Detect first lever drawn for onboarding
    if (state.levers.length > beforeCount && !state.firstLeverDrawn) {
      onFirstLeverDrawn();
    }

    releaseActivePointer(event.pointerId);
    return;
  }

  if (interaction && !interaction.moved && duration >= LONG_PRESS_MS) {
    resetMenuSheetPosition();
    openBoardPointMenu(
      interaction.startClientX,
      interaction.startClientY,
      interaction.startX,
      interaction.startY,
      interaction.leverHit ? interaction.leverHit.index : -1,
      interaction.pegIndex
    );
  }

  releaseActivePointer(event.pointerId);
}

canvas.addEventListener("pointerup", onPointerRelease);
canvas.addEventListener("pointercancel", onPointerRelease);
canvas.addEventListener("pointerleave", onPointerRelease);

pauseBtn.addEventListener("click", () => setPaused(true));
resumeBtn.addEventListener("click", () => {
  if (state.timeUp) return;
  setPaused(false);
});
restartBtn.addEventListener("click", restart);

wealthModeBtn.addEventListener("click", () => {
  switchMode();
  if (state.paused) renderPausedStats();
});

pressMenuCancel.addEventListener("click", () => {
  hidePressMenu();
  resetMenuSheetPosition();
});

pressMenu.addEventListener("click", (event) => {
  if (event.target === pressMenu) {
    hidePressMenu();
    resetMenuSheetPosition();
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;
  applyMenuAction(button.dataset.action);
  hidePressMenu();
  resetMenuSheetPosition();
  updateHud();
});

onboardingModal.addEventListener("click", (event) => {
  // Don't allow dismiss by clicking backdrop during onboarding
});

window.addEventListener("resize", () => {
  if (pressMenu.hidden) return;
  resetMenuSheetPosition();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!onboardingModal.hidden) return; // Don't dismiss onboarding with Escape
  hidePressMenu();
  resetMenuSheetPosition();
});

// Initialization
initBars();
seedBoard();
resetCounts();
updateHud();
if (isCoarsePointer) canvas.style.cursor = "default";

// Load persisted state
if (getWealthUnlocked()) {
  state.wealthUnlocked = true;
  state.wealthUnlockShown = true; // Don't re-show the banner
  wealthModeBtn.hidden = false;
  updateWealthModeBtn();
}

// Start onboarding or timer
if (!getOnboardingDone()) {
  startOnboarding();
} else {
  state.onboardingStep = 4;
  state.firstLeverDrawn = true;
  state.timerActive = true;
}

requestAnimationFrame(animate);
