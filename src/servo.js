import * as THREE from 'three';

// Sorting angles: each color routes the paddle to a different bin. Matches
// the firmware's final calibrated servo angles exactly (sorter_esp32.ino).
export const COLOR_ANGLES = {
  home: 0,
  red: 90,
  green: 70,
  blue: 10,
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
    // visually that a fixed 90deg rotation offset is what makes the paddle
    // sit flat/parallel to the belt (pointing at the straight-through blue
    // bin) at angleDeg=10, and swing up across the belt toward red at
    // angleDeg=90, matching the physical servo's real behavior.
    const MODEL_POSE_OFFSET_DEG = 90;
    const offsetFromCenter = (angleDeg - MODEL_POSE_OFFSET_DEG) * DEG2RAD;
    this.pivot.rotation.y = offsetFromCenter;
  }
}
