// UPDATED script.js - with proper hydrogen pair control and movement

// Safe DOM & canvas setup
const canvas = document.getElementById('fuelCellCanvas');
const ctx = canvas.getContext('2d');

const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const playPauseBtn = document.getElementById('playPauseBtn');

let globalSpeed = 1.0;
if (speedSlider) {
  globalSpeed = parseFloat(speedSlider.value || 1);
  speedValue.textContent = globalSpeed.toFixed(1) + 'x';
  speedSlider.addEventListener('input', () => {
    globalSpeed = parseFloat(speedSlider.value);
    speedValue.textContent = globalSpeed.toFixed(1) + 'x';
  });
} else {
  console.warn('Speed slider not found.');
}

// Animation control
let running = true;
let rafId = null;
function setRunning(val) {
  running = val;
  if (running) {
    playPauseBtn.innerHTML = '⏸ Pause';
    startAnimation();
  } else {
    playPauseBtn.innerHTML = '▶ Play';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
}
if (playPauseBtn) {
  playPauseBtn.addEventListener('click', () => setRunning(!running));
}

// Fuel Cell geometry
const fuelCell = { x: 100, y: 150, width: 600, height: 300 };
const columns = {
  leftElectrode: { x: fuelCell.x + 2, y: fuelCell.y + 2, width: 150, height: fuelCell.height - 4, color: '#bdc3c7' },
  electrolyte: { x: fuelCell.x + 152, y: fuelCell.y + 2, width: 296, height: fuelCell.height - 4, color: 'rgba(173,216,230,0.6)' },
  rightElectrode: { x: fuelCell.x + 448, y: fuelCell.y + 2, width: 150, height: fuelCell.height - 4, color: '#bdc3c7' }
};
const electrolyteBorders = {
  left: { x: columns.electrolyte.x, y: columns.electrolyte.y, width: 10, height: columns.electrolyte.height },
  right: { x: columns.electrolyte.x + columns.electrolyte.width - 10, y: columns.electrolyte.y, width: 10, height: columns.electrolyte.height }
};

// decorative particles
const particles = { minus: [], plus: [] };

// Hydrogen system (H and H+)
const hydrogen = [];
const hydrogenSettings = {
  gapMs: 3000,       // 3 second between pairs - SLOWED DOWN
  pairGapY: 25,      // vertical gap within pair - INCREASED
  radius: 12,
  baseSpeed: 1.2,
  pairHorizontalMultiplier: 1.5  // REDUCED for slower movement
};
let lastPairTime = 0;
let nextPairId = 1;

// Pair queue & allowed pair
const pairQueue = [];      // holds pairIds in spawn order
let allowedPairId = null;  // only this pair can proceed to holdLine and then to stop region

// Oxygen / Reaction / H2O
let oxygen = null; // single oxygen object at a time
const oxygenBaseSpeed = 0.7; // SLOWED DOWN
let reactionInProgress = false;

// H2O list
const h2oList = []; // H2O bubbles that move right and disappear when touching right electrode

// helpers
const now = () => performance.now();

// create entities
function createEntities() {
  // decorative
  if (Math.random() < 0.02) particles.minus.push({ x: columns.electrolyte.x, y: columns.electrolyte.y + columns.electrolyte.height, progress: 0, speed: 0.001 + Math.random() * 0.01 });
  if (Math.random() < 0.02) particles.plus.push({ x: columns.electrolyte.x + columns.electrolyte.width, y: columns.electrolyte.y, progress: 0, speed: 0.001 + Math.random() * 0.01 });

  // spawn hydrogen pair ONLY if no pairs in queue or allowed pair is done
  const t = now();
  if (t - lastPairTime >= hydrogenSettings.gapMs && pairQueue.length === 0) {
    lastPairTime = t;
    const startX = columns.leftElectrode.x + 6;
    const baseY = columns.leftElectrode.y + columns.leftElectrode.height / 2;
    const pairId = nextPairId++;
    
    // push into pairQueue and set as allowed
    pairQueue.push(pairId);
    allowedPairId = pairId;

    // create upper and lower
    hydrogen.push({ x: startX, y: baseY - hydrogenSettings.pairGapY, vx: hydrogenSettings.baseSpeed, ionized: false, stopped: false, label: 'H', pairId });
    hydrogen.push({ x: startX, y: baseY + hydrogenSettings.pairGapY, vx: hydrogenSettings.baseSpeed, ionized: false, stopped: false, label: 'H', pairId });
  }

  // oxygen spawn: spawn only if none exists, reaction not in progress, and allowed pair is ionized (both members)
  if (!oxygen && !reactionInProgress && allowedPairId !== null) {
    // count ionized members of allowedPairId
    const ionizedCount = hydrogen.reduce((c, h) => (h.pairId === allowedPairId && h.ionized) ? c + 1 : c, 0);
    if (ionizedCount >= 2) {
      oxygen = {
        x: columns.rightElectrode.x + columns.rightElectrode.width - 8,
        y: columns.rightElectrode.y + columns.rightElectrode.height / 2,
        vx: -oxygenBaseSpeed,
        active: true,
        targetPairId: allowedPairId
      };
    }
  }
}

// update entities
function updateEntities() {
  // decorative
  for (let i = particles.minus.length - 1; i >= 0; i--) {
    const p = particles.minus[i];
    p.progress += p.speed * globalSpeed * 0.8;
    if (p.progress >= 1) { particles.minus.splice(i, 1); continue; }
    p.y = columns.electrolyte.y + columns.electrolyte.height - (p.progress) * columns.electrolyte.height;
  }
  for (let i = particles.plus.length - 1; i >= 0; i--) {
    const p = particles.plus[i];
    p.progress += p.speed * globalSpeed * 0.8;
    if (p.progress >= 1) { particles.plus.splice(i, 1); continue; }
    p.y = columns.electrolyte.y + (p.progress) * columns.electrolyte.height;
  }

  const ionizeX = electrolyteBorders.left.x + electrolyteBorders.left.width;
  const stopX = electrolyteBorders.right.x - 6;

  // hydrogen update
  for (let i = hydrogen.length - 1; i >= 0; i--) {
    const p = hydrogen[i];
    
    // Only allowed pair can move
    if (p.pairId === allowedPairId) {
      if (!p.ionized) {
        // Normal movement towards ionization point
        p.x += p.vx * globalSpeed * hydrogenSettings.pairHorizontalMultiplier;
        
        // Ionization when reaching left electrolyte border
        if ((p.x + hydrogenSettings.radius) >= ionizeX) {
          p.ionized = true;
          p.label = 'H+';
          p.vx = hydrogenSettings.baseSpeed * 1.2; // Speed up after ionization
        }
      } else {
        // Ionized - move towards right border
        p.x += p.vx * globalSpeed;
        
        // Stop at right electrolyte border (where + particles are moving)
        if (p.x >= stopX - hydrogenSettings.radius) {
          p.x = stopX - hydrogenSettings.radius;
          p.stopped = true;
          p.vx = 0;
        }
      }
    }

    // cleanup if far right (shouldn't happen)
    if (p.x > canvas.width + 80) hydrogen.splice(i, 1);
  }

  // Oxygen update & collision with target allowed pair
  if (oxygen && oxygen.active) {
    oxygen.x += oxygen.vx * globalSpeed;
    
    // STOP OXYGEN AT ELECTROLYTE RIGHT BORDER
    const minX = electrolyteBorders.right.x + 10;
    if (oxygen.x < minX) {
      oxygen.x = minX;
      oxygen.vx = 0;
    }

    // find members of the target pair (ionized and stopped at right border)
    const members = hydrogen.filter(h => h.pairId === oxygen.targetPairId && h.ionized && h.stopped);
    
    if (members.length >= 2) {
      const avgX = (members[0].x + members[1].x) / 2;
      const avgY = (members[0].y + members[1].y) / 2;
      const dx = Math.abs(oxygen.x - avgX);
      const dy = Math.abs(oxygen.y - avgY);
      
      if (dx < 40 && dy < 40) {
        // Reaction: remove all hydrogens of this pair
        for (let i = hydrogen.length - 1; i >= 0; i--) {
          if (hydrogen[i].pairId === oxygen.targetPairId) hydrogen.splice(i, 1);
        }
        
        // create H2O at collision point
        const h2o = { x: avgX, y: avgY, vx: 2.0, alpha: 1, fadeStart: null };
        h2oList.push(h2o);

        // remove oxygen and set reaction lock
        oxygen = null;
        reactionInProgress = true;
        
        // Clear the queue to allow next pair
        pairQueue.length = 0;
        allowedPairId = null;
      }
    }
  }

  // H2O update - move right until touching cathode right border, then fade then remove
  for (let i = h2oList.length - 1; i >= 0; i--) {
    const w = h2oList[i];
    w.x += w.vx * globalSpeed;
    const returnX = columns.rightElectrode.x + columns.rightElectrode.width - 6;
    
    if (w.x >= returnX) {
      if (!w.fadeStart) w.fadeStart = now();
      const elapsed = now() - w.fadeStart;
      w.alpha = Math.max(0, 1 - elapsed / 400);
      
      if (w.alpha <= 0.02) {
        h2oList.splice(i, 1);
        reactionInProgress = false;
      }
    }
  }
}

// drawing functions
function drawEntities() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLEDAndWires();

  // left electrode
  ctx.fillStyle = columns.leftElectrode.color;
  ctx.fillRect(columns.leftElectrode.x, columns.leftElectrode.y, columns.leftElectrode.width, columns.leftElectrode.height);

  // electrolyte
  ctx.fillStyle = columns.electrolyte.color;
  ctx.fillRect(columns.electrolyte.x, columns.electrolyte.y, columns.electrolyte.width, columns.electrolyte.height);

  // electrolyte borders
  ctx.fillStyle = '#1a5276';
  ctx.fillRect(electrolyteBorders.left.x, electrolyteBorders.left.y, electrolyteBorders.left.width, electrolyteBorders.left.height);
  ctx.fillRect(electrolyteBorders.right.x, electrolyteBorders.right.y, electrolyteBorders.right.width, electrolyteBorders.right.height);

  // right electrode
  ctx.fillStyle = columns.rightElectrode.color;
  ctx.fillRect(columns.rightElectrode.x, columns.rightElectrode.y, columns.rightElectrode.width, columns.rightElectrode.height);

  // decorative particles
  particles.minus.forEach(p => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3498db'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('-', p.x, p.y);
  });
  particles.plus.forEach(p => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', p.x, p.y);
  });

  // hydrogen & ions
  hydrogen.forEach(p => {
    if (!p.ionized) {
      ctx.fillStyle = 'rgba(230,230,255,0.95)'; ctx.beginPath(); ctx.arc(p.x, p.y, hydrogenSettings.radius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,120,200,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', p.x, p.y);
    } else {
      ctx.fillStyle = 'rgba(255,245,235,0.95)'; ctx.beginPath(); ctx.arc(p.x, p.y, hydrogenSettings.radius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(220,90,80,0.95)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#c0392b'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H+', p.x, p.y);
    }
  });

  // oxygen
  if (oxygen) {
    ctx.fillStyle = 'rgba(200,230,255,0.95)'; ctx.beginPath(); ctx.arc(oxygen.x, oxygen.y, 14, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,140,180,0.95)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#0a3b5a'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('O', oxygen.x, oxygen.y);
  }

  // H2O
  h2oList.forEach(w => {
    ctx.save(); ctx.globalAlpha = w.alpha;
    ctx.fillStyle = 'rgba(100,160,255,0.95)'; ctx.beginPath(); ctx.arc(w.x, w.y, 16, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H₂O', w.x, w.y);
    ctx.restore();
  });

  drawBordersAndLabels();
}

// LED/wires and borders functions
const led = { x: fuelCell.x + fuelCell.width/2, y: 60, width: 40, height: 20, isOn: true };
const wires = {
  left: { startX: columns.electrolyte.x, startY: fuelCell.y, endX: led.x - led.width/2, endY: led.y + led.height/2, color: '#f1c40f', width: 3 },
  right: { startX: columns.electrolyte.x + columns.electrolyte.width, startY: fuelCell.y, endX: led.x + led.width/2, endY: led.y + led.height/2, color: '#f1c40f', width: 3 }
};
function drawLEDAndWires() {
  ctx.strokeStyle = wires.left.color; ctx.lineWidth = wires.left.width; ctx.beginPath();
  ctx.moveTo(wires.left.startX, wires.left.startY); ctx.lineTo(wires.left.startX, wires.left.startY - 30); ctx.lineTo(wires.left.endX, wires.left.startY - 30); ctx.lineTo(wires.left.endX, wires.left.endY); ctx.stroke();
  ctx.strokeStyle = wires.right.color; ctx.lineWidth = wires.right.width; ctx.beginPath();
  ctx.moveTo(wires.right.startX, wires.right.startY); ctx.lineTo(wires.right.startX, wires.right.startY - 30); ctx.lineTo(wires.right.endX, wires.right.startY - 30); ctx.lineTo(wires.right.endX, wires.right.endY); ctx.stroke();

  ctx.fillStyle = led.isOn ? '#ff4757' : '#95a5a6'; ctx.fillRect(led.x - led.width/2, led.y, led.width, led.height);
  if (led.isOn) { ctx.shadowColor = '#ff4757'; ctx.shadowBlur = 15; ctx.fillRect(led.x - led.width/2, led.y, led.width, led.height); ctx.shadowBlur = 0; }
  ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2; ctx.strokeRect(led.x - led.width/2, led.y, led.width, led.height);
  ctx.fillStyle = 'white'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.fillText('LED', led.x, led.y - 10);
  ctx.fillStyle = 'white'; ctx.font = '10px Arial'; ctx.fillText('-', led.x - led.width/4, led.y + led.height/2 + 3); ctx.fillText('+', led.x + led.width/4, led.y + led.height/2 + 3);
}

function drawBordersAndLabels() {
  ctx.strokeStyle = '#3498db'; ctx.lineWidth = 4; ctx.beginPath();
  ctx.moveTo(fuelCell.x, fuelCell.y); ctx.lineTo(fuelCell.x + fuelCell.width, fuelCell.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fuelCell.x, fuelCell.y + fuelCell.height); ctx.lineTo(fuelCell.x + fuelCell.width, fuelCell.y + fuelCell.height); ctx.stroke();

  const gapSize = 120;
  ctx.beginPath(); ctx.moveTo(fuelCell.x, fuelCell.y); ctx.lineTo(fuelCell.x, fuelCell.y + (fuelCell.height - gapSize) / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fuelCell.x, fuelCell.y + (fuelCell.height - gapSize) / 2 + gapSize); ctx.lineTo(fuelCell.x, fuelCell.y + fuelCell.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fuelCell.x + fuelCell.width, fuelCell.y); ctx.lineTo(fuelCell.x + fuelCell.width, fuelCell.y + (fuelCell.height - gapSize) / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fuelCell.x + fuelCell.width, fuelCell.y + (fuelCell.height - gapSize) / 2 + gapSize); ctx.lineTo(fuelCell.x + fuelCell.width, fuelCell.y + fuelCell.height); ctx.stroke();

  ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
  ctx.fillText('ELECTROLYTE', columns.electrolyte.x + columns.electrolyte.width/2, columns.electrolyte.y + columns.electrolyte.height/2);
  ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#e74c3c';
  ctx.fillText('ANODE', columns.leftElectrode.x + columns.leftElectrode.width/2, columns.leftElectrode.y - 20);
  ctx.fillStyle = '#3498db'; ctx.fillText('CATHODE', columns.rightElectrode.x + columns.rightElectrode.width/2, columns.rightElectrode.y - 20);
}

// main loop
let blinkCounter = 0;
function animate() {
  if (!running) return;
  blinkCounter++;
  if (blinkCounter % 60 === 0) led.isOn = !led.isOn;
  createEntities();
  updateEntities();
  drawEntities();
  rafId = requestAnimationFrame(animate);
}

// initialize and start
lastPairTime = now() - hydrogenSettings.gapMs * 0.9;
setRunning(true);
function startAnimation() { if (!rafId) rafId = requestAnimationFrame(animate); }