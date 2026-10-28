(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const lanePositions = [-4.2, 0, 4.2];
  const BASE_TARGET_SPEED_KMH = 20;
  const SPEED_INCREASE_PER_MINUTE_KMH = 5;
  const TARGET_SPEED_LIMIT_KMH = 120;
  const WEATHER_STAGES = [
    { label: 'CLARO', accent: '#38bdf8', background: 0x020617, road: 0x090d16, fog: 0x020617, ambient: 0x38bdf8, light: 0x93c5fd, intensity: 0.55 },
    { label: 'DUSK', accent: '#fbbf24', background: 0x111827, road: 0x101827, fog: 0x111827, ambient: 0xf59e0b, light: 0xfef3c7, intensity: 0.72 },
    { label: 'CHUVA', accent: '#60a5fa', background: 0x0f172a, road: 0x070b12, fog: 0x111827, ambient: 0x60a5fa, light: 0xbfdbfe, intensity: 0.82 },
    { label: 'NOITE', accent: '#a78bfa', background: 0x02030a, road: 0x040812, fog: 0x020617, ambient: 0x7c3aed, light: 0xe9d5ff, intensity: 0.62 }
  ];

  let scene, camera, renderer, playerCar, playerDriver, roadLines, skyline, ambientLight, sunLight;
  let trafficCars = [], streetLights = [], sparkParticles = [], cityBlocks = [], fogParticles = [];
  let ambulance = null, hospitalBuilding = null, rescueTimer = 0;
  let currentLane = 1, targetX = 0, speed = 0, score = 0, crashSpeedKmh = 0, credits = 0;
  let isPaused = false, gameOver = false, rescueState = 0;
  let lastFrameTime = 0, elapsed = 0, audioCtx = null, animationId = 0;
  let targetSpeedKmh = BASE_TARGET_SPEED_KMH;
  let currentMaxInternalSpeed = (BASE_TARGET_SPEED_KMH / 500) * 2.6;
  let comboStreak = 0, comboMultiplier = 1, comboTimer = 0;
  let stageIndex = 0;
  const upgrades = { engine: 0, handling: 0, nitro: 0 };
  const isTouchDevice = matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 760px)').matches;
  const mats = {};

  function getOrientationMode() {
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }

  function updateOrientationIndicator() {
    const indicator = $('orientation-indicator');
    if (!indicator) return;
    const mode = getOrientationMode();
    indicator.textContent = `ORIENTAÇÃO: ${mode === 'landscape' ? 'PAISAGEM' : 'RETRATO'}`;
  }

  function updateHUD() {
    const kmh = Math.round((speed / currentMaxInternalSpeed) * targetSpeedKmh);
    $('speed').textContent = `${kmh} KM/H`;
    $('score').textContent = Math.floor(score).toString();
    $('combo').textContent = `x${comboMultiplier.toFixed(1)}`;
    $('weather-indicator').textContent = WEATHER_STAGES[stageIndex].label;
    $('credits').textContent = credits.toString();
    $('level-indicator').textContent = `NÍVEL ${Math.max(1, Math.floor(elapsed / 20) + 1)}`;
  }

  function updateTargetSpeed() {
    const engineBonus = upgrades.engine * 8;
    const minutesPassed = Math.floor(elapsed / 60);
    const nextTargetSpeed = Math.min(BASE_TARGET_SPEED_KMH + engineBonus + minutesPassed * SPEED_INCREASE_PER_MINUTE_KMH, TARGET_SPEED_LIMIT_KMH + engineBonus);
    if (nextTargetSpeed !== targetSpeedKmh) targetSpeedKmh = nextTargetSpeed;
    currentMaxInternalSpeed = (targetSpeedKmh / 500) * 2.8;
  }

  function makeMaterials() {
    mats.road = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.45, metalness: 0.3 });
    mats.line = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    mats.glass = new THREE.MeshPhysicalMaterial({ color: 0x050b14, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.85 });
    mats.wheel = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    mats.headlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mats.tail = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    mats.roadside = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    mats.treeTrunk = new THREE.MeshStandardMaterial({ color: 0x4b2e2b, roughness: 0.9 });
    mats.treeLeaf = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8 });
    mats.windowGlow = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8 });
  }

  function applyWeatherStage() {
    const stage = WEATHER_STAGES[stageIndex];
    if (!scene) return;
    scene.background = new THREE.Color(stage.background);
    scene.fog.color.setHex(stage.fog);
    if (mats.line) mats.line.color.setHex(stage.accent);
    if (ambientLight) {
      ambientLight.color.setHex(stage.ambient);
      ambientLight.intensity = stage.intensity;
    }
    if (sunLight) sunLight.color.setHex(stage.light);
    document.body.style.setProperty('--bg', `#${stage.background.toString(16).padStart(6, '0')}`);
    document.body.style.setProperty('--accent', stage.accent);
    if ($('weather-indicator')) $('weather-indicator').textContent = stage.label;
  }

  function updateWeatherStage() {
    const nextStage = Math.min(WEATHER_STAGES.length - 1, Math.floor(elapsed / 22) % WEATHER_STAGES.length);
    if (nextStage !== stageIndex) {
      stageIndex = nextStage;
      applyWeatherStage();
    }
  }

  function updateCombo(delta) {
    if (comboTimer > 0) {
      comboTimer -= delta;
    } else if (comboStreak > 0) {
      comboStreak = Math.max(0, comboStreak - 1);
      comboTimer = 0.8;
    }
    comboMultiplier = 1 + Math.min(3.6, comboStreak * 0.25);
  }

  function createStreetPole() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.25 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 8), metal);
    pole.position.y = 3.5; group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    lamp.position.set(1, 6.8, 0); group.add(lamp);
    return group;
  }

  function createTree() {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.5, 8), mats.treeTrunk);
    trunk.position.y = 0.75; group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), mats.treeLeaf);
    leaves.position.y = 2.1; group.add(leaves);
    return group;
  }

  function createApartmentBlock(width, height, depth) {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.75, metalness: 0.2 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x7dd3fc, roughness: 0.15, transparent: true, opacity: 0.75 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wall); base.position.y = height / 2; g.add(base);
    const front = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, height * 0.7, 0.2), glass); front.position.set(0, height * 0.62, depth / 2 + 0.12); g.add(front);
    return g;
  }

  function createFogCloud() {
    const fog = new THREE.Mesh(
      new THREE.SphereGeometry(2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.08, depthWrite: false })
    );
    fog.userData = { drift: Math.random() * Math.PI * 2, speed: 0.2 + Math.random() * 0.6, driftX: (Math.random() - 0.5) * 3 };
    return fog;
  }

  function buildEnvironment() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 1200), mats.road);
    road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    for (const x of [-12, 12]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 1200), sidewalkMat); side.position.set(x, -0.2, 0); side.receiveShadow = true; scene.add(side);
    }

    skyline = new THREE.Group();
    for (let z = -540; z < 540; z += 44) {
      const left = createApartmentBlock(3.6, 10 + (z % 4) * 2.4, 4.2); left.position.set(-16, 0, z); skyline.add(left);
      const right = createApartmentBlock(3.6, 9 + ((z + 22) % 5) * 2.1, 4.2); right.position.set(16, 0, z + 14); skyline.add(right);
      const treeLeft = createTree(); treeLeft.position.set(-9.5, 0, z + 6); skyline.add(treeLeft);
      const treeRight = createTree(); treeRight.position.set(9.5, 0, z + 8); skyline.add(treeRight);
    }
    scene.add(skyline);

    for (let i = 0; i < 18; i++) {
      const cloud = createFogCloud();
      cloud.position.set((Math.random() - 0.5) * 16, 2 + Math.random() * 5, -200 + i * 28);
      fogParticles.push(cloud);
      scene.add(cloud);
    }

    roadLines = new THREE.Group();
    const lineGeo = new THREE.PlaneGeometry(0.12, 7);
    for (let z = -600; z < 600; z += 24) {
      for (const x of [-2.1, 2.1]) {
        const line = new THREE.Mesh(lineGeo, mats.line); line.rotation.x = -Math.PI / 2; line.position.set(x, 0.025, z); roadLines.add(line);
      }
    }
    scene.add(roadLines);

    for (let z = -450; z < 450; z += 70) {
      const pole = createStreetPole(); pole.position.set(-10, 0, z); scene.add(pole); streetLights.push(pole);
      const other = pole.clone(); other.position.x = 11; other.position.z = z + 16; scene.add(other); streetLights.push(other);
    }
  }

  function playSound(type) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === 'crash') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(24, now + 0.28);
        gain.gain.setValueAtTime(0.22, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); osc.start(); osc.stop(now + 0.3);
      } else {
        osc.type = 'sine'; osc.frequency.setValueAtTime(560, now); osc.frequency.linearRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.04, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); osc.start(); osc.stop(now + 0.2);
      }
    } catch (_) {}
  }

  function box(w, h, d, material, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  function createVehicleModel(type = 'sedan') {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x2563eb, roughness: 0.18, metalness: 0.65, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 12);

    if (type === 'truck') {
      box(2.7, 0.8, 5.4, bodyMat, 0, 0.7, 0, group);
      box(2.05, 0.66, 2.2, mats.glass, 0, 1.22, -0.2, group);
      for (const x of [-1.3, 1.3]) {
        box(0.5, 0.18, 0.08, mats.headlight, x, 0.8, -2.8, group);
        box(0.5, 0.18, 0.08, mats.tail, x, 0.8, 2.8, group);
      }
      for (const [x, z] of [[-1.35, 1.7], [1.35, 1.7], [-1.35, -1.7], [1.35, -1.7]]) {
        const wheel = new THREE.Mesh(wheelGeo, mats.wheel); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); group.add(wheel);
      }
      return group;
    }

    if (type === 'van') {
      box(2.5, 0.8, 4.8, bodyMat, 0, 0.7, 0, group);
      box(1.95, 0.7, 2.2, mats.glass, 0, 1.18, -0.1, group);
      for (const x of [-0.92, 0.92]) {
        box(0.5, 0.18, 0.08, mats.headlight, x, 0.8, -2.45, group);
        box(0.5, 0.18, 0.08, mats.tail, x, 0.8, 2.45, group);
      }
      for (const [x, z] of [[-1.28, 1.45], [1.28, 1.45], [-1.28, -1.45], [1.28, -1.45]]) {
        const wheel = new THREE.Mesh(wheelGeo, mats.wheel); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); group.add(wheel);
      }
      return group;
    }

    if (type === 'bike') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.8), bodyMat); body.position.set(0, 0.6, 0); group.add(body);
      const rider = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.65, 0.3), new THREE.MeshStandardMaterial({ color: 0xfef3c7 })); rider.position.set(0, 1.15, -0.1); group.add(rider);
      const wheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), mats.wheel); wheel1.rotation.z = Math.PI / 2; wheel1.position.set(0.5, 0.2, 0); group.add(wheel1);
      const wheel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), mats.wheel); wheel2.rotation.z = Math.PI / 2; wheel2.position.set(-0.5, 0.2, 0); group.add(wheel2);
      return group;
    }

    box(2.1, 0.65, 4.2, bodyMat, 0, 0.55, 0, group);
    box(1.65, 0.58, 2.15, mats.glass, 0, 1.08, -0.15, group);
    for (const x of [-0.75, 0.75]) {
      box(0.4, 0.15, 0.06, mats.headlight, x, 0.6, -2.12, group);
      box(0.4, 0.15, 0.06, mats.tail, x, 0.6, 2.12, group);
    }
    for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3], [-1.1, -1.3], [1.1, -1.3]]) {
      const wheel = new THREE.Mesh(wheelGeo, mats.wheel); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); group.add(wheel);
    }
    return group;
  }

  function createCar(color, isPlayer = false, variant = 'sedan') {
    const car = createVehicleModel(variant);
    car.traverse((child) => {
      if (child.material && child.material.color && child.material !== mats.glass && child.material !== mats.wheel) {
        child.material.color = new THREE.Color(color);
      }
    });

    if (isPlayer) {
      playerDriver = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0xffdbac });
      const clothes = new THREE.MeshStandardMaterial({ color: 0x1e40af });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 8), skin); head.position.set(0, 1.1, -0.2); playerDriver.add(head);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.3), clothes); torso.position.set(0, 0.8, -0.2); playerDriver.add(torso);
      playerDriver.visible = false; car.add(playerDriver);
    }
    car.userData.targetX = 0;
    car.userData.desiredLane = 0;
    car.userData.sway = Math.random() * Math.PI * 2;
    car.userData.passed = false;
    car.userData.speedBias = 0.8 + Math.random() * 0.7;
    if (variant === 'bike') car.userData.speedBias *= 1.2;
    return car;
  }

  function createTraffic(count) {
    const colors = [0x2563eb, 0x10b981, 0xf59e0b, 0xa855f7, 0xe2e8f0, 0xfb7185, 0x94a3b8];
    const vehicleTypes = ['sedan', 'van', 'truck', 'sedan', 'bike'];
    for (let i = 0; i < count; i++) {
      const variant = vehicleTypes[i % vehicleTypes.length];
      const car = createCar(colors[i % colors.length], false, variant);
      const laneIndex = i % 3;
      const z = -90 - i * 95;
      car.position.set(lanePositions[laneIndex], 0, z);
      car.userData.targetX = lanePositions[laneIndex];
      car.userData.desiredLane = laneIndex;
      scene.add(car);
      trafficCars.push(car);
    }
  }

  function respawnTrafficCar(car) {
    let furthest = -100;
    for (const other of trafficCars) if (other !== car) furthest = Math.min(furthest, other.position.z);
    const lane = lanePositions[Math.floor(Math.random() * lanePositions.length)];
    const variants = ['sedan', 'van', 'truck', 'sedan', 'bike'];
    const randomVariant = variants[Math.floor(Math.random() * variants.length)];
    car.position.set(lane, 0, Math.min(-120, furthest - (65 + Math.random() * 45)));
    car.rotation.set(0, 0, 0);
    car.userData.type = randomVariant;
    car.userData.targetX = lane;
    car.userData.desiredLane = lanePositions.indexOf(lane);
    car.userData.speedBias = 0.8 + Math.random() * 0.7 + (randomVariant === 'bike' ? 0.3 : 0);
    car.userData.passed = false;
    car.traverse((child) => {
      if (child.material && child.material.color && child.material !== mats.glass && child.material !== mats.wheel) {
        child.material.color = new THREE.Color([0x2563eb, 0x10b981, 0xf59e0b, 0xa855f7, 0xe2e8f0, 0xfb7185, 0x94a3b8][Math.floor(Math.random() * 7)]);
      }
    });
    const scale = randomVariant === 'bike' ? 0.9 : randomVariant === 'truck' ? 1.2 : 1;
    car.scale.setScalar(scale);
  }

  function createMedic(color) {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xf5d0a9 });
    const cloth = new THREE.MeshStandardMaterial({ color });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skin); head.position.y = 1.6; group.add(head);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.22), cloth); torso.position.y = 1.05; group.add(torso);
    const armGeo = new THREE.BoxGeometry(0.14, 0.45, 0.14);
    const leftArm = new THREE.Mesh(armGeo, cloth); leftArm.position.set(-0.28, 0.9, 0); group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, cloth); rightArm.position.set(0.28, 0.9, 0); group.add(rightArm);
    const legGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    const leftLeg = new THREE.Mesh(legGeo, cloth); leftLeg.position.set(-0.12, 0.35, 0); group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, cloth); rightLeg.position.set(0.12, 0.35, 0); group.add(rightLeg);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.18), new THREE.MeshStandardMaterial({ color: 0x0f172a })); bag.position.set(0.3, 0.8, 0.32); group.add(bag);
    group.visible = false;
    return group;
  }

  function createStretcher() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 2.2), metal); base.position.y = 0.7; g.add(base);
    const side1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.9), metal); side1.position.set(-0.62, 0.48, 0); g.add(side1);
    const side2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.9), metal); side2.position.set(0.62, 0.48, 0); g.add(side2);
    for (const x of [-0.45, 0.45]) for (const z of [-0.75, 0.75]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0x111827 }));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.17, z); g.add(wheel);
    }
    g.visible = false;
    return g;
  }

  function createPatient() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const clothes = new THREE.MeshStandardMaterial({ color: 0x1d4ed8 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skin); head.position.y = 1.38; g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.58, 0.22), clothes); body.position.y = 0.86; g.add(body);
    const legGeo = new THREE.BoxGeometry(0.14, 0.55, 0.14);
    const leftLeg = new THREE.Mesh(legGeo, clothes); leftLeg.position.set(-0.13, 0.28, 0); g.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, clothes); rightLeg.position.set(0.13, 0.28, 0); g.add(rightLeg);
    g.visible = false;
    return g;
  }

  function spawnRescueActors() {
    const medicsList = [createMedic(0x22c55e), createMedic(0x38bdf8), createMedic(0xf59e0b)];
    medicsList.forEach((medic) => scene.add(medic));
    const stretcherRef = createStretcher(); const patientRef = createPatient();
    scene.add(stretcherRef); scene.add(patientRef);
    stretcher = stretcherRef; patient = patientRef;
    stretcher.visible = false; patient.visible = false;
    return medicsList;
  }

  function clearRescueActors() {
    if (medics.length) {
      medics.forEach((medic) => scene.remove(medic));
      medics = [];
    }
    if (stretcher) { scene.remove(stretcher); stretcher = null; }
    if (patient) { scene.remove(patient); patient = null; }
  }

  function chooseTrafficLaneForCar(car, preferredLaneIndex) {
    const choices = lanePositions.map((lane, idx) => ({ lane, idx })).filter(({ idx }) => idx !== preferredLaneIndex);
    const valid = choices.filter(({ lane, idx }) => !trafficCars.some(other => other !== car && Math.abs(other.userData.targetX - lane) < 1.2 && Math.abs(other.position.z - car.position.z) < 12));
    if (!valid.length) return false;
    const choice = valid[Math.floor(Math.random() * valid.length)];
    car.userData.targetX = choice.lane;
    car.userData.desiredLane = choice.idx;
    return true;
  }

  function updateAmbulanceTrafficBehavior() {
    if (!ambulance) return;
    for (const car of trafficCars) {
      const dist = car.position.z - ambulance.position.z;
      if (dist > 0 && dist < 20 && Math.abs(car.position.x - ambulance.position.x) < 2.8) {
        const preferredLane = lanePositions.indexOf(car.userData.targetX);
        const altLane = lanePositions.map((lane, idx) => ({ lane, idx })).filter(({ idx }) => idx !== preferredLane);
        const available = altLane.filter(({ lane, idx }) => !trafficCars.some(other => other !== car && Math.abs(other.userData.targetX - lane) < 1.2 && Math.abs(other.position.z - car.position.z) < 12));
        if (available.length > 0) {
          const chosen = available[Math.floor(Math.random() * available.length)];
          car.userData.targetX = chosen.lane;
          car.userData.desiredLane = chosen.idx;
        }
        car.position.z += 0.9 * (1 + Math.min(1.5, (20 - dist) / 20));
      }
    }
  }

  function tickRescueAnimation() {
    if (!ambulance) return;
    const baseX = ambulance.position.x;
    const baseZ = ambulance.position.z;

    medics.forEach((medic, index) => {
      medic.visible = true;
      const phase = elapsed * 5 + index;
      const offsetX = (index - 1) * 0.8;
      const offsetZ = rescueState === 1 ? 2.8 + Math.sin(phase) * 0.2 : rescueState === 2 ? 2.2 + index * 0.2 : 1.3 + index * 0.2;
      medic.position.set(baseX + offsetX, 0.9 + Math.sin(phase * 2) * 0.06, baseZ + offsetZ);
      medic.rotation.y = Math.sin(phase) * 0.4;
    });

    if (rescueState === 2) {
      medics[0].position.lerp(new THREE.Vector3(playerCar.position.x - 0.9, 0.9, playerCar.position.z + 1.3), 0.08);
      medics[1].position.lerp(new THREE.Vector3(playerCar.position.x, 0.9, playerCar.position.z + 1.8), 0.08);
      medics[2].position.lerp(new THREE.Vector3(playerCar.position.x + 0.9, 0.9, playerCar.position.z + 0.8), 0.08);
    }

    if (rescueState >= 3) {
      const stretcherTarget = new THREE.Vector3(playerCar.position.x, 0.25, playerCar.position.z + 1.3);
      if (stretcher) {
        stretcher.visible = true;
        stretcher.position.lerp(stretcherTarget, 0.12);
        stretcher.rotation.y = Math.sin(elapsed * 3) * 0.15;
      }
      if (patient) {
        patient.visible = true;
        patient.position.set(stretcherTarget.x, 0.8, stretcherTarget.z + 0.2);
        patient.rotation.y = Math.PI / 2;
      }
    }

    if (rescueState === 4) {
      if (stretcher) {
        stretcher.position.x = ambulance.position.x;
        stretcher.position.z = ambulance.position.z + 1.5;
      }
      if (patient) {
        patient.position.x = ambulance.position.x;
        patient.position.z = ambulance.position.z + 1.5;
      }
    }
  }

  function triggerCrash() {
    if (rescueState !== 0 || gameOver) return;
    rescueState = 1;
    crashSpeedKmh = Math.round((speed / currentMaxInternalSpeed) * targetSpeedKmh);
    speed = 0;
    playSound('crash');
    createSparks(playerCar.position);
    playerCar.rotation.z = 0.18; playerCar.rotation.x = -0.08;
    if (playerDriver) {
      playerDriver.visible = true;
      playerDriver.position.set(2.7, 0.2, -0.5);
      playerDriver.rotation.z = Math.PI / 2;
    }
    if (!ambulance) {
      ambulance = createAmbulance();
      scene.add(ambulance);
    }
    ambulance.position.set(playerCar.position.x, 0, playerCar.position.z + 28);
    if (!hospitalBuilding) {
      hospitalBuilding = createHospital();
      scene.add(hospitalBuilding);
    }
    if (medics.length === 0 && !stretcher) {
      const spawned = spawnRescueActors();
      medics = spawned;
    }
    $('speed-lines').style.opacity = '0'; rescueTimer = 0;
  }

  function finishGame() {
    gameOver = true; isPaused = false; $('pause-ui').style.display = 'none';
    const reward = Math.max(20, Math.floor(score / 25) + comboStreak * 12);
    credits += reward;
    $('final-stats').textContent = `Pontuação: ${Math.floor(score)} · Velocidade no acidente: ${crashSpeedKmh} KM/H · Créditos ganhos: ${reward}`;
    $('game-over-ui').style.display = 'flex';
    $('credits').textContent = credits.toString();
  }

  function updateRescue(delta, ratio) {
    rescueTimer += delta;
    updateAmbulanceTrafficBehavior();
    tickRescueAnimation();

    if (ambulance) {
      const blink = Math.sin(elapsed * 14) > 0;
      ambulance.userData.lights[0].material.color.setHex(blink ? 0xdc2626 : 0x111111);
      ambulance.userData.lights[1].material.color.setHex(blink ? 0x111111 : 0x2563eb);
      if (rescueState === 1) {
        ambulance.position.z -= 0.55 * ratio;
        if (ambulance.position.z <= playerCar.position.z + 8) {
          rescueState = 2;
          rescueTimer = 0;
        }
      } else if (rescueState === 2) {
        if (rescueTimer > 2.6) {
          rescueState = 3;
          rescueTimer = 0;
        }
      } else if (rescueState === 3) {
        ambulance.position.z -= 0.42 * ratio;
        if (ambulance.position.z <= playerCar.position.z + 2) {
          rescueState = 4;
          rescueTimer = 0;
        }
      } else if (rescueState === 4) {
        ambulance.position.z -= 0.8 * ratio;
        if (ambulance.position.z < playerCar.position.z - 25) finishGame();
      }
    }

    trafficCars.forEach((car) => {
      car.position.z += 0.28 * ratio;
      if (car.position.z > 35) respawnTrafficCar(car);
    });

    if (hospitalBuilding) hospitalBuilding.position.z += 0.18 * ratio;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerCar.position.x * 0.3, 0.06 * ratio);
    camera.position.y = getOrientationMode() === 'landscape' ? 4.2 : 5.2;
    camera.position.z = getOrientationMode() === 'landscape' ? 9 : 11.5;
    camera.lookAt(playerCar.position.x, 0.8, -7);
    if (rescueTimer > 14 && rescueState !== 0) finishGame();
  }

  function createSparks(position) {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08), mat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(position);
      p.position.y += 0.5;
      p.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.75, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.75);
      p.userData.life = 1 + Math.random() * 0.7;
      sparkParticles.push(p); scene.add(p);
    }
  }

  function updateParticles(delta) {
    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const p = sparkParticles[i]; p.userData.life -= delta; p.position.addScaledVector(p.userData.velocity, delta * 60); p.userData.velocity.y -= 0.025 * delta * 60;
      if (p.position.y <= 0 || p.userData.life <= 0) { scene.remove(p); sparkParticles.splice(i, 1); }
    }

    for (let i = fogParticles.length - 1; i >= 0; i--) {
      const cloud = fogParticles[i];
      cloud.position.z += 0.6 * delta * 60;
      cloud.position.x += Math.sin(elapsed + i) * 0.02;
      if (cloud.position.z > 60) cloud.position.z = -200;
    }
  }

  function animate(now) {
    animationId = requestAnimationFrame(animate);
    if (!renderer || isPaused || gameOver) { lastFrameTime = now; return; }

    const delta = Math.min(Math.max((now - (lastFrameTime || now)) / 1000, 0), 0.05);
    lastFrameTime = now;
    const ratio = delta * 60;
    elapsed += delta;

    updateParticles(delta);
    updateTargetSpeed();
    updateCombo(delta);
    updateWeatherStage();
    updateOrientationIndicator();

    if (rescueState === 0) {
      const handlingBoost = 1 + upgrades.handling * 0.13;
      const nitroBoost = 1 + upgrades.nitro * 0.04;
      speed = THREE.MathUtils.lerp(speed, currentMaxInternalSpeed, 0.06 * ratio);
      const kmh = Math.round((speed / currentMaxInternalSpeed) * targetSpeedKmh * nitroBoost);
      score += (kmh / 80) * ratio * comboMultiplier;
      $('speed').textContent = `${kmh} KM/H`;
      $('score').textContent = Math.floor(score).toString();
      $('speed-lines').style.opacity = String((kmh / targetSpeedKmh) * 0.32);

      playerCar.position.x += (targetX - playerCar.position.x) * Math.min(0.22 * ratio * handlingBoost, 1);
      playerCar.rotation.z = -(targetX - playerCar.position.x) * 0.06;
      roadLines.children.forEach((line) => { line.position.z += speed * 16 * ratio; if (line.position.z > 50) line.position.z -= 600; });
      streetLights.forEach((p) => { p.position.z += speed * 16 * ratio; if (p.position.z > 100) p.position.z -= 900; });
      if (skyline) skyline.children.forEach((part) => { part.position.z += speed * 10 * ratio; if (part.position.z > 90) part.position.z -= 1200; });

      for (const car of trafficCars) {
        car.position.z += (speed * 13 - 0.18) * ratio * car.userData.speedBias;
        car.position.x += (car.userData.targetX - car.position.x) * Math.min(0.11 * ratio, 1);
        car.rotation.z = -(car.userData.targetX - car.position.x) * 0.06;
        car.userData.sway += 0.025 * ratio;
        car.position.y = Math.sin(car.userData.sway) * 0.05;

        if (!car.userData.passed && car.position.z > playerCar.position.z + 6) {
          car.userData.passed = true;
          comboStreak = Math.min(comboStreak + 1, 12);
          comboTimer = 1.4;
          credits += 2 + comboStreak;
          $('credits').textContent = credits.toString();
        }

        if (car.position.z > 30) respawnTrafficCar(car);
        if (Math.abs(playerCar.position.x - car.position.x) < 1.7 && Math.abs(playerCar.position.z - car.position.z) < 3.6) {
          triggerCrash();
          break;
        }
      }

      const mode = getOrientationMode();
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerCar.position.x * 0.35, Math.min(0.1 * ratio, 1));
      camera.position.y = mode === 'landscape' ? 4.2 : 5.2;
      camera.position.z = mode === 'landscape' ? 9 : 11.5;
      camera.lookAt(playerCar.position.x, 0.8, -7);
    } else {
      updateRescue(delta, ratio);
    }

    if (ambulance) {
      sirenPulse += delta * 12;
      const hue = Math.sin(sirenPulse) > 0 ? 0xdc2626 : 0x2563eb;
      ambulance.userData.lights[0].material.color.setHex(hue);
      ambulance.userData.lights[1].material.color.setHex(hue === 0xdc2626 ? 0x111111 : 0x2563eb);
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  function createAmbulance() {
    const amb = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const red = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2563eb });
    box(2.4, 2, 4.2, white, 0, 1.25, -0.35, amb);
    box(2.25, 1.25, 1.7, white, 0, 1.05, 2, amb);
    const r = box(0.55, 0.2, 0.25, red, -0.5, 2.35, 1.7, amb);
    const b = box(0.55, 0.2, 0.25, blue, 0.5, 2.35, 1.7, amb);
    amb.userData.lights = [r, b];
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    for (const [x, z] of [[-1.2, 1.6], [1.2, 1.6], [-1.2, -1.5], [1.2, -1.5]]) {
      const w = new THREE.Mesh(wheelGeo, mats.wheel); w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); amb.add(w);
    }
    return amb;
  }

  function createHospital() {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: 0.15, transparent: true, opacity: 0.85 });
    box(30, 22, 16, wall, 0, 11, 0, g);
    box(7, 4, 0.2, glass, -3.5, 2, 8.1, g);
    box(7, 4, 0.2, glass, 3.5, 2, 8.1, g);
    const sign = box(10, 1.5, 0.3, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), 0, 19, 8.2, g);
    sign.material = sign.material;
    g.position.set(0, 0, -180);
    return g;
  }

  function onResize() {
    if (!camera || !renderer) return;
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
    const landscape = getOrientationMode() === 'landscape';
    camera.aspect = width / height;
    camera.fov = width < 600 || !landscape ? 58 : 50;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.25 : 1.5));
    updateOrientationIndicator();
  }

  function clearObject(obj) {
    if (!obj) return;
    scene.remove(obj);
    obj.traverse?.((child) => {
      if (child.geometry && !Object.values(mats).includes(child.material)) child.geometry.dispose();
    });
  }

  function resetGame() {
    if (animationId) cancelAnimationFrame(animationId);
    for (const car of trafficCars) clearObject(car); trafficCars = [];
    for (const p of sparkParticles) clearObject(p); sparkParticles = [];
    for (const cloud of fogParticles) clearObject(cloud); fogParticles = [];
    clearObject(playerCar); clearObject(ambulance); clearObject(hospitalBuilding);
    clearRescueActors();
    playerCar = null; ambulance = null; hospitalBuilding = null; playerDriver = null;
    $('game-over-ui').style.display = 'none'; $('pause-ui').style.display = 'none'; $('speed-lines').style.opacity = '0'; $('loading-message').style.display = 'none';
    currentLane = 1; targetX = 0; speed = 0; score = 0; crashSpeedKmh = 0; rescueState = 0; rescueTimer = 0; isPaused = false; gameOver = false; elapsed = 0; targetSpeedKmh = BASE_TARGET_SPEED_KMH; comboStreak = 0; comboMultiplier = 1; comboTimer = 0; stageIndex = 0;
    $('speed').textContent = '0 KM/H'; $('score').textContent = '0';
    $('combo').textContent = 'x1.0';
    playerCar = createCar(0xef4444, true, 'sedan'); scene.add(playerCar); createTraffic(5);
    applyWeatherStage();
    lastFrameTime = performance.now(); animationId = requestAnimationFrame(animate);
  }

  function moveLane(direction) {
    if (isPaused || gameOver || rescueState !== 0) return;
    currentLane = THREE.MathUtils.clamp(currentLane + direction, 0, 2);
    targetX = lanePositions[currentLane];
  }

  function handleKey(e) {
    const key = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
    if (key === 'u') { toggleShop(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (e.repeat || isPaused || gameOver || rescueState !== 0) return;
    if (key === 'a' || key === 'arrowleft') moveLane(-1);
    if (key === 'd' || key === 'arrowright') moveLane(1);
  }

  function togglePause() {
    if (gameOver || rescueState !== 0) return;
    isPaused = !isPaused; $('pause-ui').style.display = isPaused ? 'flex' : 'none';
    if (!isPaused) lastFrameTime = performance.now();
  }

  function updateShopButtons() {
    document.querySelectorAll('[data-upgrade]').forEach((button) => {
      const key = button.dataset.upgrade;
      const level = upgrades[key];
      const levelNode = document.querySelector(`[data-upgrade-level="${key}"]`);
      if (levelNode) levelNode.textContent = String(level);
      button.textContent = level >= 5 ? 'MAX' : 'MEJORAR';
      button.disabled = level >= 5;
      button.style.opacity = level >= 5 ? '0.6' : '1';
    });
  }

  function toggleShop(forceOpen = null) {
    const isVisible = $('shop-ui').style.display === 'flex';
    const shouldOpen = forceOpen !== null ? forceOpen : !isVisible;
    $('shop-ui').style.display = shouldOpen ? 'flex' : 'none';
    if (shouldOpen) {
      updateShopButtons();
      $('shop-ui').focus?.();
    }
  }

  function buyUpgrade(type) {
    const cost = { engine: 120, handling: 160, nitro: 210 }[type] + upgrades[type] * 60;
    if (credits < cost || upgrades[type] >= 5) return;
    credits -= cost;
    upgrades[type] += 1;
    updateShopButtons();
    updateHUD();
    if ($('credits')) $('credits').textContent = credits.toString();
  }

  function init() {
    if (!window.THREE) {
      $('loading-message').textContent = 'Não foi possível carregar o Three.js. Verifique a conexão e recarregue.';
      return;
    }

    const container = $('canvas-container');
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x020617); scene.fog = new THREE.Fog(0x020617, 18, 180);
    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
    renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice, powerPreference: 'high-performance', precision: 'mediump' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouchDevice ? 1.25 : 1.5)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = !isTouchDevice; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('ACESFilmicToneMapping' in THREE) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; }
    container.appendChild(renderer.domElement);

    ambientLight = new THREE.AmbientLight(0x38bdf8, 0.55);
    scene.add(ambientLight);
    sunLight = new THREE.DirectionalLight(0x93c5fd, 1.1); sunLight.position.set(20, 40, 20); sunLight.castShadow = !isTouchDevice; sunLight.shadow.mapSize.set(512, 512); scene.add(sunLight);

    makeMaterials(); buildEnvironment(); playerCar = createCar(0xef4444, true, 'sedan'); scene.add(playerCar); createTraffic(5);
    applyWeatherStage(); updateOrientationIndicator(); updateHUD();

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', () => { setTimeout(onResize, 120); }, { passive: true });
    window.addEventListener('keydown', handleKey);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', resetGame);
    $('btn-left').addEventListener('pointerdown', (e) => { e.preventDefault(); moveLane(-1); });
    $('btn-right').addEventListener('pointerdown', (e) => { e.preventDefault(); moveLane(1); });
    $('btn-shop').addEventListener('click', () => toggleShop(true));
    $('btn-close-shop').addEventListener('click', () => toggleShop(false));
    document.querySelectorAll('[data-upgrade]').forEach((button) => {
      button.addEventListener('click', () => buyUpgrade(button.dataset.upgrade));
    });

    let startX = null, startY = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { startX = e.clientX; startY = e.clientY; } }, { passive: true });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || startX === null) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
      startX = null; startY = null;
    }, { passive: true });

    document.addEventListener('visibilitychange', () => { if (document.hidden && !isPaused && !gameOver && rescueState === 0) togglePause(); });
    $('loading-message').style.display = 'none'; onResize(); lastFrameTime = performance.now(); animationId = requestAnimationFrame(animate);
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
