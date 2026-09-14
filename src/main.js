import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ServoController } from './servo.js';
import { createLabelRenderer, attachLabel, makeStatBox } from './labels.js';
import { subscribeToSorterState, subscribeToConnectionState } from './firebase.js';
import { BeltAnimation } from './beltAnimation.js';

const container = document.getElementById('app');
const loadingEl = document.getElementById('loading');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
camera.position.set(2, 1.5, 2.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const labelRenderer = createLabelRenderer(container);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.3, 0);

// Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 1.1);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 5, 2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 20;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xaac8ff, 0.6);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(6, 24, 0x444a55, 0x2a2e36);
grid.position.y = 0.001;
scene.add(grid);

// Model registry so future commands (move belt, rotate servo, etc.) can find named parts.
export const modelParts = {};
let servoController = null;
let beltAnimation = null;

const liveState = {
  servoAngle: 90,
  detectedColor: 'none',
  counts: { red: 0, green: 0, blue: 0 },
  sensor: { r: 0, g: 0, b: 0, clear: 0 },
  state: 'idle',
  cycleId: 0,
};

let statRefs = null;
const phaseEl = document.getElementById('phase-status');

function refreshPhaseLabel() {
  if (!phaseEl) return;
  const labels = {
    idle: 'Idle — waiting for cube',
    feeding: 'Feeding belt…',
    sensing: 'Reading color…',
    sorting: 'Sorting…',
    returning: 'Returning to idle…',
  };
  phaseEl.textContent = labels[liveState.state] || liveState.state;
}

function setupLiveLabels() {
  const servo = modelParts['sorter_servo_assembly'];
  const sensor = modelParts['color_sensor_assembly'];
  const binRed = modelParts['bin_red_left'];
  const binGreen = modelParts['bin_green_right'];
  const binBlue = modelParts['bin_blue_end'];

  const servoStat = makeStatBox('Servo Angle');
  const sensorStat = makeStatBox('Color Sensor');
  const redStat = makeStatBox('Red Count');
  const greenStat = makeStatBox('Green Count');
  const blueStat = makeStatBox('Blue Count');

  servoStat.el.classList.add('servo');
  sensorStat.el.classList.add('sensor');
  redStat.el.classList.add('red');
  greenStat.el.classList.add('green');
  blueStat.el.classList.add('blue');

  if (servo) attachLabel(servo, new THREE.Vector3(0.03, 0.2, 0.08), servoStat.el);
  if (sensor) attachLabel(sensor, new THREE.Vector3(-0.138, 0.24, -0.005), sensorStat.el);
  if (binRed) attachLabel(binRed, new THREE.Vector3(0, 0.12, 0), redStat.el);
  if (binGreen) attachLabel(binGreen, new THREE.Vector3(0, 0.12, 0), greenStat.el);
  if (binBlue) attachLabel(binBlue, new THREE.Vector3(0, 0.12, 0), blueStat.el);

  statRefs = { servoStat, sensorStat, redStat, greenStat, blueStat };
  refreshLabels();
}

function refreshLabels() {
  if (!statRefs) return;
  const s = liveState.sensor;
  statRefs.sensorStat.valueEl.textContent = `R:${s.r} G:${s.g} B:${s.b} C:${s.clear}`;
  statRefs.redStat.valueEl.textContent = String(liveState.counts.red ?? 0);
  statRefs.greenStat.valueEl.textContent = String(liveState.counts.green ?? 0);
  statRefs.blueStat.valueEl.textContent = String(liveState.counts.blue ?? 0);
}

const statusEl = document.getElementById('connection-status');
subscribeToConnectionState((connected) => {
  statusEl.classList.toggle('live', connected);
  statusEl.classList.toggle('offline', !connected);
  statusEl.querySelector('.label').textContent = connected ? 'Live' : 'Offline';
});

subscribeToSorterState((data) => {
  if (typeof data.servoAngle === 'number') {
    liveState.servoAngle = data.servoAngle;
    servoController?.setTargetAngle(data.servoAngle);
  } else if (data.detectedColor) {
    servoController?.setTargetColor(data.detectedColor);
  }
  if (data.detectedColor) liveState.detectedColor = data.detectedColor;
  if (data.counts) liveState.counts = data.counts;
  if (data.sensor) liveState.sensor = data.sensor;
  if (data.state) liveState.state = data.state;
  if (typeof data.cycleId === 'number') liveState.cycleId = data.cycleId;

  beltAnimation?.onFirebaseState(
    { state: data.state, cycleId: data.cycleId, detectedColor: data.detectedColor },
    performance.now()
  );

  refreshLabels();
  refreshPhaseLabel();
});

const loader = new GLTFLoader();
loader.load(
  '/models/AuxScene.glb',
  (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
      if (child.name) {
        modelParts[child.name] = child;
      }
    });

    // Auto-fit and center the model in view.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;

    scene.add(model);
    window.conveyorModel = model;

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fovRad = (camera.fov * Math.PI) / 180;
    const fitDist = (maxDim / 2) / Math.tan(fovRad / 2) / Math.min(1, camera.aspect);
    const dist = fitDist * 1.15;
    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, size.y * 0.4, 0);
    controls.minDistance = maxDim * 0.3;
    controls.maxDistance = maxDim * 8;
    controls.update();

    console.log('Loaded model parts:', Object.keys(modelParts));

    // Rig the servo: the horn/paddle meshes are siblings of servo_shaft, not
    // children, so regroup them under a pivot at the shaft position. Rotating
    // the pivot then swings horn + paddle together like a real servo.
    const servoAssembly = modelParts['sorter_servo_assembly'];
    const shaft = modelParts['servo_shaft'];
    if (servoAssembly && shaft) {
      const pivot = new THREE.Group();
      pivot.name = 'servo_pivot';
      pivot.position.copy(shaft.position);
      servoAssembly.add(pivot);

      const movingPartNames = [
        'servo_horn_bar_long',
        'servo_horn_bar_short',
        'sorter_paddle_link',
        'sorter_paddle_arm',
        'sorter_paddle_accent',
      ];
      for (const name of movingPartNames) {
        const part = modelParts[name];
        if (!part) continue;
        part.position.sub(shaft.position);
        pivot.add(part);
      }
      modelParts['servo_pivot'] = pivot;
      servoController = new ServoController(pivot);
      servoController.applyAngle(90);
    }

    setupLiveLabels();
    beltAnimation = new BeltAnimation(scene, modelParts);
    refreshPhaseLabel();

    loadingEl.style.display = 'none';
  },
  (progress) => {
    if (progress.total) {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      loadingEl.textContent = `Loading conveyor model… ${pct}%`;
    }
  },
  (error) => {
    console.error('Failed to load model:', error);
    loadingEl.textContent = 'Failed to load model — see console.';
  }
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (servoController) {
    servoController.update(delta);
    if (statRefs) {
      statRefs.servoStat.valueEl.textContent = `${Math.round(servoController.currentAngle)}°`;
    }
  }
  if (beltAnimation) {
    const beltRunning = liveState.state === 'feeding' || liveState.state === 'returning';
    beltAnimation.update(performance.now(), beltRunning);
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
