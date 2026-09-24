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
    // Servo horn sweeps 0-180deg; map to a rotation around the shaft's Y axis,
    // centered so 0deg (home) matches the model's originally authored pose.
    const offsetFromCenter = (angleDeg - COLOR_ANGLES.home) * DEG2RAD;
    this.pivot.rotation.y = offsetFromCenter;
  }
}
