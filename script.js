(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const lanePositions = [-4.2, 0, 4.2];
  const BASE_TARGET_SPEED_KMH = 20;
  const SPEED_INCREASE_PER_MINUTE_KMH = 5;
  const TARGET_SPEED_LIMIT_KMH = 120;
  let scene, camera, renderer, playerCar, playerDriver, roadLines;
  let trafficCars = [], streetLights = [], sparkParticles = [];
  let ambulance = null, hospitalBuilding = null, rescueTimer = 0;
  let currentLane = 1, targetX = 0, speed = 0, score = 0, crashSpeedKmh = 0;
  let isPaused = false, gameOver = false, rescueState = 0;
  let lastFrameTime = 0, elapsed = 0, audioCtx = null, animationId = 0;
  let targetSpeedKmh = BASE_TARGET_SPEED_KMH;
  let currentMaxInternalSpeed = (BASE_TARGET_SPEED_KMH / 500) * 2.6;
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

  function updateTargetSpeed() {
    const minutesPassed = Math.floor(elapsed / 60);
    const nextTargetSpeed = Math.min(BASE_TARGET_SPEED_KMH + minutesPassed * SPEED_INCREASE_PER_MINUTE_KMH, TARGET_SPEED_LIMIT_KMH);
    if (nextTargetSpeed !== targetSpeedKmh) targetSpeedKmh = nextTargetSpeed;
    currentMaxInternalSpeed = (targetSpeedKmh / 500) * 2.6;
  }

  function makeMaterials() {
    mats.road = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: .45, metalness: .3 });
    mats.line = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    mats.glass = new THREE.MeshPhysicalMaterial({ color: 0x050b14, metalness: .1, roughness: .12, transparent: true, opacity: .85 });
    mats.wheel = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: .8 });
    mats.headlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mats.tail = new THREE.MeshBasicMaterial({ color: 0xff1111 });
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
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(24, now + .28);
        gain.gain.setValueAtTime(.22, now); gain.gain.exponentialRampToValueAtTime(.001, now + .3); osc.start(); osc.stop(now + .3);
      } else {
        osc.type = 'sine'; osc.frequency.setValueAtTime(560, now); osc.frequency.linearRampToValueAtTime(880, now + .18);
        gain.gain.setValueAtTime(.04, now); gain.gain.exponentialRampToValueAtTime(.001, now + .2); osc.start(); osc.stop(now + .2);
      }
    } catch (_) { /* Áudio é opcional; o jogo continua mesmo se o navegador bloquear som. */ }
  }

  function box(w, h, d, material, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  function createCar(color, isPlayer = false) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: .18, metalness: .65, clearcoat: .8, clearcoatRoughness: .1 });
    box(2.1, .65, 4.2, bodyMat, 0, .55, 0, car);
    box(1.65, .58, 2.15, mats.glass, 0, 1.08, -.15, car);
    for (const x of [-.75, .75]) {
      box(.4, .15, .06, mats.headlight, x, .6, -2.12, car);
      box(.4, .15, .06, mats.tail, x, .6, 2.12, car);
    }
    const wheelGeo = new THREE.CylinderGeometry(.38, .38, .32, 12);
    for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3], [-1.1, -1.3], [1.1, -1.3]]) {
      const wheel = new THREE.Mesh(wheelGeo, mats.wheel); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .38, z); car.add(wheel);
    }
    if (isPlayer) {
      playerDriver = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0xffdbac });
      const clothes = new THREE.MeshStandardMaterial({ color: 0x1e40af });
      const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 8, 8), skin); head.position.set(0, 1.1, -.2); playerDriver.add(head);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(.45, .55, .3), clothes); torso.position.set(0, .8, -.2); playerDriver.add(torso);
      playerDriver.visible = false; car.add(playerDriver);
    }
    car.userData.targetX = 0;
    return car;
  }

  function createStreetPole() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: .8, roughness: .25 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, 7, 8), metal); pole.position.y = 3.5; group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8 })); lamp.position.set(1, 6.8, 0); group.add(lamp);
    return group;
  }

  function buildEnvironment() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 1200), mats.road); road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: .8 });
    for (const x of [-12, 12]) { const side = new THREE.Mesh(new THREE.BoxGeometry(6, .4, 1200), sidewalkMat); side.position.set(x, -.2, 0); side.receiveShadow = true; scene.add(side); }
    roadLines = new THREE.Group();
    const lineGeo = new THREE.PlaneGeometry(.12, 7);
    for (let z = -600; z < 600; z += 24) for (const x of [-2.1, 2.1]) {
      const line = new THREE.Mesh(lineGeo, mats.line); line.rotation.x = -Math.PI / 2; line.position.set(x, .025, z); roadLines.add(line);
    }
    scene.add(roadLines);
    for (let z = -450; z < 450; z += 70) {
      const pole = createStreetPole(); pole.position.set(-10, 0, z); scene.add(pole); streetLights.push(pole);
      const other = pole.clone(); other.position.x = 11; other.position.z = z + 16; scene.add(other); streetLights.push(other);
    }
  }

  function createTraffic(count) {
    const colors = [0x2563eb, 0x10b981, 0xf59e0b, 0xa855f7, 0xe2e8f0];
    for (let i = 0; i < count; i++) {
      const car = createCar(colors[i % colors.length]); const laneIndex = i % 3; const z = -90 - i * 95;
      car.position.set(lanePositions[laneIndex], 0, z); car.userData.targetX = lanePositions[laneIndex]; scene.add(car); trafficCars.push(car);
    }
  }

  function respawnTrafficCar(car) {
    let furthest = -100;
    for (const other of trafficCars) if (other !== car) furthest = Math.min(furthest, other.position.z);
    const lane = lanePositions[Math.floor(Math.random() * lanePositions.length)];
    car.position.set(lane, 0, Math.min(-120, furthest - (65 + Math.random() * 45))); car.userData.targetX = lane;
  }

  function createAmbulance() {
    const amb = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: .3 });
    const red = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2563eb });
    box(2.4, 2, 4.2, white, 0, 1.25, -.35, amb);
    box(2.25, 1.25, 1.7, white, 0, 1.05, 2, amb);
    const r = box(.55, .2, .25, red, -.5, 2.35, 1.7, amb);
    const b = box(.55, .2, .25, blue, .5, 2.35, 1.7, amb);
    amb.userData.lights = [r, b];
    const wheelGeo = new THREE.CylinderGeometry(.35, .35, .3, 12);
    for (const [x, z] of [[-1.2, 1.6], [1.2, 1.6], [-1.2, -1.5], [1.2, -1.5]]) {
      const w = new THREE.Mesh(wheelGeo, mats.wheel); w.rotation.z = Math.PI / 2; w.position.set(x, .35, z); amb.add(w);
    }
    return amb;
  }

  function createHospital() {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: .15, transparent: true, opacity: .85 });
    box(30, 22, 16, wall, 0, 11, 0, g);
    box(7, 4, .2, glass, -3.5, 2, 8.1, g);
    box(7, 4, .2, glass, 3.5, 2, 8.1, g);
    const sign = box(10, 1.5, .3, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), 0, 19, 8.2, g);
    sign.material = sign.material;
    g.position.set(0, 0, -180);
    return g;
  }

  function moveLane(direction) {
    if (isPaused || gameOver || rescueState !== 0) return;
    currentLane = THREE.MathUtils.clamp(currentLane + direction, 0, 2); targetX = lanePositions[currentLane];
  }

  function handleKey(e) {
    const key = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
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

  function createSparks(position) {
    const geo = new THREE.BoxGeometry(.08, .08, .08), mat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(position);
      p.position.y += .5;
      p.userData.velocity = new THREE.Vector3((Math.random() - .5) * .65, (Math.random() - .5) * 1.2, (Math.random() - .5) * .65);
      p.userData.life = 1 + Math.random() * .7;
      sparkParticles.push(p); scene.add(p);
    }
  }

  function triggerCrash() {
    if (rescueState !== 0 || gameOver) return;
    rescueState = 1;
    crashSpeedKmh = Math.round((speed / currentMaxInternalSpeed) * targetSpeedKmh);
    speed = 0;
    playSound('crash');
    createSparks(playerCar.position);
    playerCar.rotation.z = .18; playerCar.rotation.x = -.08;
    if (playerDriver) {
      playerDriver.visible = true;
      playerDriver.position.set(2.7, .2, -.5);
      playerDriver.rotation.z = Math.PI / 2;
    }
    ambulance = createAmbulance(); ambulance.position.set(playerCar.position.x, 0, playerCar.position.z + 28); scene.add(ambulance);
    hospitalBuilding = createHospital(); scene.add(hospitalBuilding);
    $('speed-lines').style.opacity = '0'; rescueTimer = 0;
  }

  function finishGame() {
    gameOver = true; isPaused = false; $('pause-ui').style.display = 'none'; $('final-stats').textContent = `Pontuação: ${Math.floor(score)} · Velocidade no acidente: ${crashSpeedKmh} KM/H`;
    $('game-over-ui').style.display = 'flex';
  }

  function updateRescue(delta, ratio) {
    rescueTimer += delta;
    if (ambulance) {
      const blink = Math.sin(elapsed * 14) > 0;
      ambulance.userData.lights[0].material.color.setHex(blink ? 0xdc2626 : 0x111111);
      ambulance.userData.lights[1].material.color.setHex(blink ? 0x111111 : 0x2563eb);
      if (rescueState === 1) {
        ambulance.position.z -= .5 * ratio;
        if (ambulance.position.z <= playerCar.position.z + 8) rescueState = 2;
      } else if (rescueState === 2) {
        if (rescueTimer > 2.5) rescueState = 3;
      } else if (rescueState === 3) {
        ambulance.position.z -= .8 * ratio;
        if (ambulance.position.z < playerCar.position.z - 25) finishGame();
      }
    }
    trafficCars.forEach(car => { car.position.z += .25 * ratio; if (car.position.z > 35) respawnTrafficCar(car); });
    if (hospitalBuilding) hospitalBuilding.position.z += .2 * ratio;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerCar.position.x * .3, .06 * ratio);
    camera.position.y = getOrientationMode() === 'landscape' ? 4.2 : 5.2;
    camera.position.z = getOrientationMode() === 'landscape' ? 9 : 11.5;
    camera.lookAt(playerCar.position.x, .8, -7);
    if (rescueTimer > 14 && rescueState !== 0) finishGame();
  }

  function updateParticles(delta) {
    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const p = sparkParticles[i]; p.userData.life -= delta; p.position.addScaledVector(p.userData.velocity, delta * 60); p.userData.velocity.y -= .025 * delta * 60;
      if (p.position.y <= 0 || p.userData.life <= 0) { scene.remove(p); sparkParticles.splice(i, 1); }
    }
  }

  function animate(now) {
    animationId = requestAnimationFrame(animate);
    if (!renderer || isPaused || gameOver) { lastFrameTime = now; return; }
    const delta = Math.min(Math.max((now - (lastFrameTime || now)) / 1000, 0), .05); lastFrameTime = now; const ratio = delta * 60; elapsed += delta;
    updateParticles(delta);
    updateTargetSpeed();
    updateOrientationIndicator();
    if (rescueState === 0) {
      speed = THREE.MathUtils.lerp(speed, currentMaxInternalSpeed, .06 * ratio);
      const kmh = Math.round((speed / currentMaxInternalSpeed) * targetSpeedKmh);
      score += kmh / 80 * ratio;
      $('speed').textContent = `${kmh} KM/H`;
      $('score').textContent = Math.floor(score).toString();
      $('speed-lines').style.opacity = String((kmh / targetSpeedKmh) * .32);
      playerCar.position.x += (targetX - playerCar.position.x) * Math.min(.22 * ratio, 1); playerCar.rotation.z = -(targetX - playerCar.position.x) * .06;
      roadLines.children.forEach(line => { line.position.z += speed * 16 * ratio; if (line.position.z > 50) line.position.z -= 600; });
      streetLights.forEach(p => { p.position.z += speed * 16 * ratio; if (p.position.z > 100) p.position.z -= 900; });
      for (const car of trafficCars) {
        car.position.z += (speed * 13 - .18) * ratio; car.position.x += (car.userData.targetX - car.position.x) * Math.min(.1 * ratio, 1);
        if (car.position.z > 30) respawnTrafficCar(car);
        if (Math.abs(playerCar.position.x - car.position.x) < 1.7 && Math.abs(playerCar.position.z - car.position.z) < 3.6) { triggerCrash(); break; }
      }
      const mode = getOrientationMode();
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerCar.position.x * .35, Math.min(.1 * ratio, 1));
      camera.position.y = mode === 'landscape' ? 4.2 : 5.2;
      camera.position.z = mode === 'landscape' ? 9 : 11.5;
      camera.lookAt(playerCar.position.x, .8, -7);
    } else {
      updateRescue(delta, ratio);
    }
    renderer.render(scene, camera);
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

  function clearObject(obj) { if (!obj) return; scene.remove(obj); obj.traverse?.(child => { if (child.geometry && !Object.values(mats).includes(child.material)) child.geometry.dispose(); }); }

  function resetGame() {
    if (animationId) cancelAnimationFrame(animationId);
    for (const car of trafficCars) clearObject(car); trafficCars = [];
    for (const p of sparkParticles) clearObject(p); sparkParticles = [];
    clearObject(playerCar); clearObject(ambulance); clearObject(hospitalBuilding);
    playerCar = null; ambulance = null; hospitalBuilding = null; playerDriver = null;
    $('game-over-ui').style.display = 'none'; $('pause-ui').style.display = 'none'; $('speed-lines').style.opacity = '0'; $('loading-message').style.display = 'none';
    currentLane = 1; targetX = 0; speed = 0; score = 0; crashSpeedKmh = 0; rescueState = 0; rescueTimer = 0; isPaused = false; gameOver = false; elapsed = 0; targetSpeedKmh = BASE_TARGET_SPEED_KMH; currentMaxInternalSpeed = (BASE_TARGET_SPEED_KMH / 500) * 2.6;
    $('speed').textContent = '0 KM/H'; $('score').textContent = '0';
    playerCar = createCar(0xef4444, true); scene.add(playerCar); createTraffic(5);
    lastFrameTime = performance.now(); animationId = requestAnimationFrame(animate);
  }

  function init() {
    if (!window.THREE) {
      $('loading-message').textContent = 'Não foi possível carregar o Three.js. Verifique a conexão e recarregue.';
      return;
    }
    const container = $('canvas-container');
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x020617); scene.fog = new THREE.FogExp2(0x020617, .007);
    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 500);
    renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice, powerPreference: 'high-performance', precision: 'mediump' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouchDevice ? 1.25 : 1.5)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = !isTouchDevice; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('ACESFilmicToneMapping' in THREE) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; }
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0x38bdf8, .55));
    const light = new THREE.DirectionalLight(0x93c5fd, 1.1); light.position.set(20, 40, 20); light.castShadow = !isTouchDevice; light.shadow.mapSize.set(512, 512); scene.add(light);
    makeMaterials(); buildEnvironment(); playerCar = createCar(0xef4444, true); scene.add(playerCar); createTraffic(5);
    updateOrientationIndicator();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', () => { setTimeout(onResize, 120); }, { passive: true });
    window.addEventListener('keydown', handleKey);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', resetGame);
    $('btn-left').addEventListener('pointerdown', e => { e.preventDefault(); moveLane(-1); });
    $('btn-right').addEventListener('pointerdown', e => { e.preventDefault(); moveLane(1); });
    let startX = null, startY = null;
    renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { startX = e.clientX; startY = e.clientY; } }, { passive: true });
    renderer.domElement.addEventListener('pointerup', e => {
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
