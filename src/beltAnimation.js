import * as THREE from 'three';

// Mirrors the firmware's timing constants (sorter_esp32.ino) so the web
// animation's pacing matches the real machine. Tune alongside the firmware
// README's calibration notes.
const TIMING = {
  feedMs: 800,
  settleMs: 150,
  servoMoveMs: 500,
  servoDropMs: 350,
  clearRunMs: 300,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Reads real-world positions off the loaded model instead of hardcoding
// coordinates, so this stays correct if the GLB is re-exported/rescaled.
function worldPos(obj) {
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  return v;
}

const CUBE_NEUTRAL_COLOR = 0xdddddd;
const CUBE_COLORS = {
  red: 0xe0524f,
  green: 0x4fbf6a,
  blue: 0x4f8ce0,
};

export class BeltAnimation {
  constructor(scene, modelParts) {
    this.scene = scene;
    this.modelParts = modelParts;
    this.cube = null;
    this.belt = null;
    this.phase = 'idle';
    this.phaseStartMs = 0;
    this.lastCycleId = null;
    this.dropColor = null;
    this.spawned = false;
    this._lastNow = null;

    this._computeLayout();
    this._buildCube();
    this._findBeltMesh();
  }

  _computeLayout() {
    const p = this.modelParts;
    const motorEnd = worldPos(p['roller_motor_end']);
    const sensor = worldPos(p['color_sensor_chip']);
    const servoShaft = worldPos(p['servo_shaft']);
    const beltTop = worldPos(p['belt_top_run']);
    const binRed = worldPos(p['bin_red_left']);
    const binGreen = worldPos(p['bin_green_right']);
    const binBlue = worldPos(p['bin_blue_end']);

    // Belt runs along X; cube rides on top of belt_top_run at its Y/Z.
    this.beltY = beltTop.y + 0.012; // sit on top of the belt surface
    this.beltZ = beltTop.z;

    // Entry point: right at the near roller, nudged inward just enough to
    // clear the roller geometry.
    this.xStart = motorEnd.x + 0.012;
    // The color sensor chip's own X can sit almost on top of the entry in
    // this compact model, so guarantee a visible amount of belt travel
    // before "sensing" rather than trusting the raw sensor mesh position.
    this.xSensor = Math.max(sensor.x, this.xStart + 0.025);
    this.xSort = servoShaft.x - 0.02; // just before the paddle so it doesn't clip

    this.binTargets = {
      red: new THREE.Vector3(binRed.x, binRed.y + 0.03, binRed.z),
      green: new THREE.Vector3(binGreen.x, binGreen.y + 0.03, binGreen.z),
      blue: new THREE.Vector3(binBlue.x, binBlue.y + 0.03, binBlue.z),
    };
  }

  _buildCube() {
    const geometry = new THREE.BoxGeometry(0.022, 0.02, 0.022);
    const material = new THREE.MeshStandardMaterial({
      color: CUBE_NEUTRAL_COLOR,
      roughness: 0.5,
      metalness: 0.05,
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.visible = false;
    this.scene.add(cube);
    this.cube = cube;
  }

  _findBeltMesh() {
    this.belt = this.modelParts['belt_top_run'] || null;
    if (this.belt && this.belt.material) {
      // Clone so scrolling the texture here doesn't affect any shared
      // material instances elsewhere in the scene.
      this.belt.material = this.belt.material.clone();
      const map = this.belt.material.map;
      if (map) {
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
      }
    }
  }

  _setPhase(phase, nowMs) {
    this.phase = phase;
    this.phaseStartMs = nowMs;
  }

  // Called whenever new Firebase state arrives.
  onFirebaseState({ state, cycleId, detectedColor }, nowMs) {
    if (typeof cycleId === 'number' && cycleId !== this.lastCycleId) {
      this.lastCycleId = cycleId;
      this.dropColor = null;
      this.spawned = false;
      this._setPhase('feeding', nowMs);
      return;
    }

    // No cycleId change but an explicit state was pushed (e.g. first message
    // after page load, or state moved on without a cycleId bump).
    if (state && state !== this.phase) {
      if (state === 'sorting' && detectedColor && detectedColor !== 'none') {
        this._setDropColor(detectedColor);
      }
      if (state === 'idle') {
        this.dropColor = null;
      }
      this._setPhase(state, nowMs);
    } else if (state === 'sorting' && detectedColor && !this.dropColor) {
      this._setDropColor(detectedColor);
    }
  }

  _setDropColor(color) {
    this.dropColor = color;
    const hex = CUBE_COLORS[color];
    if (hex !== undefined) this.cube.material.color.setHex(hex);
  }

  update(nowMs, beltRunning) {
    // Belt texture scroll: only while the motor is actually driving, i.e.
    // during feeding/sorting-clear phases (mirrors motorForward() calls in
    // firmware). Falls back to a slow idle creep so the twin doesn't look
    // frozen while waiting for a cube.
    if (this.belt?.material?.map) {
      const speed = beltRunning ? 1.6 : 0.15;
      this.belt.material.map.offset.x += speed * (nowMs - (this._lastNow ?? nowMs)) * 0.001;
    }
    this._lastNow = nowMs;

    const elapsed = nowMs - this.phaseStartMs;

    switch (this.phase) {
      case 'idle': {
        this.cube.visible = false;
        break;
      }

      case 'feeding': {
        if (!this.spawned) {
          this.cube.position.set(this.xStart, this.beltY, this.beltZ);
          this.cube.rotation.set(0, 0, 0);
          this.cube.material.color.setHex(CUBE_NEUTRAL_COLOR);
          this.cube.visible = true;
          this.spawned = true;
        }
        const t = easeInOut(THREE.MathUtils.clamp(elapsed / TIMING.feedMs, 0, 1));
        this.cube.position.x = lerp(this.xStart, this.xSensor, t);
        this.cube.rotation.z = Math.sin(t * Math.PI) * 0.15;
        break;
      }

      case 'sensing': {
        // Cube sits under the color sensor while the reading settles.
        this.cube.position.x = this.xSensor;
        this.cube.rotation.z = 0;
        break;
      }

      case 'sorting': {
        // Slide from the sensor position to the paddle/sort point, then hold
        // while the servo swings and the cube drops into its bin. Blue rides
        // straight through with no sideways deflection (paddle stays near
        // home); red/green get pushed sideways off the belt centerline into
        // their bins by the paddle. Bin choice here is driven purely by
        // dropColor (from detectedColor), independent of the servo's actual
        // angle — see servo.js's COLOR_ANGLES for the angle-per-color values.
        const travelMs = TIMING.servoMoveMs;
        const target = this.binTargets[this.dropColor] || this.binTargets.blue;
        if (elapsed < travelMs) {
          const t = easeInOut(THREE.MathUtils.clamp(elapsed / travelMs, 0, 1));
          this.cube.position.x = lerp(this.xSensor, this.xSort, t);
        } else {
          const dropT = easeInOut(
            THREE.MathUtils.clamp((elapsed - travelMs) / TIMING.servoDropMs, 0, 1)
          );
          this.cube.position.x = lerp(this.xSort, target.x, dropT);
          this.cube.position.y = lerp(this.beltY, target.y, dropT);
          this.cube.position.z = lerp(this.beltZ, target.z, dropT);
          this.cube.rotation.x = dropT * Math.PI * 0.6;
        }
        break;
      }

      case 'returning': {
        // Cube has settled into the bin; fade it out for the next cycle.
        if (elapsed > TIMING.clearRunMs * 0.6) {
          this.cube.visible = false;
        }
        break;
      }
    }
  }
}
