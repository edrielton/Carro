  function finishGame() {
    if (gameOver) return;
    gameOver = true; isPaused = false; $('pause-ui').style.display = 'none';
    const reward = Math.max(20, Math.floor(score / 25) + comboStreak * 12);
    credits += reward;
    saveData.credits = credits;
    saveData.bestScore = Math.max(saveData.bestScore, Math.floor(score));
    persistSave();
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
        if (playerDriver) {
          const loadPosition = ambulance.position.clone().add(new THREE.Vector3(0, 1.15, 1.1));
          playerDriver.position.lerp(loadPosition, 0.12);
        }
        if (ambulance.position.z < playerCar.position.z - 25) {
          finishGame();
        }
      }
    }

    trafficCars.forEach((car) => {
      car.position.z += 0.28 * ratio;
      if (car.position.z > 35) respawnTrafficCar(car);
    });

    if (hospitalBuilding) hospitalBuilding.position.z += 0.18 * ratio;

    const mode = getOrientationMode();
    const followTarget = ambulance ? ambulance.position.clone() : playerCar.position.clone();
    const offset = ambulance
      ? new THREE.Vector3(0, mode === 'landscape' ? 4.2 : 5.8, mode === 'landscape' ? 9.5 : 12.2)
      : new THREE.Vector3(0, mode === 'landscape' ? 4.2 : 5.2, mode === 'landscape' ? 9 : 11.5);
    const shakeOffset = cameraShake > 0 ? new THREE.Vector3(
      (Math.random() - 0.5) * cameraShake,
      (Math.random() - 0.5) * cameraShake * 0.5,
      (Math.random() - 0.5) * cameraShake * 0.6
    ) : new THREE.Vector3();
    const desiredCameraPosition = followTarget.clone().add(offset).add(shakeOffset);
    camera.position.lerp(desiredCameraPosition, 0.08 * ratio);

    const lookTarget = new THREE.Vector3(
      ambulance ? ambulance.position.x : playerCar.position.x,
      ambulance ? 1.2 : 0.8,
      ambulance ? ambulance.position.z - 10 : -7
    );
    camera.lookAt(lookTarget);

    const desiredFov = ambulance ? (mode === 'landscape' ? 52 : 58) : (window.innerWidth < 600 || mode !== 'landscape' ? 58 : 50);
    camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov, 0.08 * ratio);
    camera.updateProjectionMatrix();
    cameraShake = Math.max(0, cameraShake - delta * 1.6);

    if (rescueState >= 4 && rescueTimer > 14) {
      finishGame();
    }
  }
