import * as THREE from 'three';

// Sorting angles: each color routes the paddle to a different bin.
// red -> 30deg (per the annotated reference image), others spread across 0-180.
export const COLOR_ANGLES = {
  red: 30,
  green: 90,
  blue: 150,
  none: 90,
};

const DEG2RAD = Math.PI / 180;

export class ServoController {
  constructor(pivot, { degPerSecond = 180 } = {}) {
    this.pivot = pivot;
    this.degPerSecond = degPerSecond;
    this.currentAngle = 90;
    this.targetAngle = 90;
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
    // centered so 90deg matches the model's originally authored pose.
    const offsetFromCenter = (angleDeg - 90) * DEG2RAD;
    this.pivot.rotation.y = offsetFromCenter;
  }
}
