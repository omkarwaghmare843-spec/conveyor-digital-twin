import * as THREE from 'three';

// Sorting angles: each color routes the paddle to a different bin. These
// are visually-tuned for this 3D model's geometry and intentionally don't
// match the firmware's real servo angles (sorter_esp32.ino) — the on-screen
// "servo angle" label still shows the real firmware value; only the 3D
// paddle's rotation uses this table (see main.js's subscribeToSorterState).
export const COLOR_ANGLES = {
  home: 0,
  red: 70,
  green: 50,
  blue: 0,
  none: 0,
};

const DEG2RAD = Math.PI / 180;

export class ServoController {
  constructor(pivot, { degPerSecond = 180 } = {}) {
    this.pivot = pivot;
    this.degPerSecond = degPerSecond;
    this.currentAngle = COLOR_ANGLES.home;
    this.targetAngle = COLOR_ANGLES.home;
  }

  setTargetAngle(angleDeg) {
    this.targetAngle = THREE.MathUtils.clamp(angleDeg, 0, 180);
  }

  setTargetColor(color) {
    const angle = COLOR_ANGLES[color] ?? COLOR_ANGLES.none;
    this.setTargetAngle(angle);
  }

  update(deltaSeconds) {
    if (this.currentAngle === this.targetAngle) return;
    const maxStep = this.degPerSecond * deltaSeconds;
    const diff = this.targetAngle - this.currentAngle;
    const step = THREE.MathUtils.clamp(diff, -maxStep, maxStep);
    this.currentAngle += step;
    this.applyAngle(this.currentAngle);
  }

  applyAngle(angleDeg) {
    // Servo horn sweeps 0-180deg; map to a rotation around the shaft's Y
    // axis. The model's originally authored pose (rotation.y = 0) doesn't
    // correspond to any of our calibrated angles by itself — verified
    // visually that a fixed 90deg rotation offset makes the paddle look
    // right across the COLOR_ANGLES sweep (home/blue flat along the belt,
    // red/green swung across it). Note: angleDeg here is COLOR_ANGLES'
    // visually-tuned value for the detected color, not the raw firmware
    // servoAngle — see main.js's subscribeToSorterState.
    const MODEL_POSE_OFFSET_DEG = 90;
    const offsetFromCenter = (angleDeg - MODEL_POSE_OFFSET_DEG) * DEG2RAD;
    this.pivot.rotation.y = offsetFromCenter;
  }
}
