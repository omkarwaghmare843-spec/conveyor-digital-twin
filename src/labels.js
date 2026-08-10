import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export function createLabelRenderer(container) {
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);
  return labelRenderer;
}

// Attaches an existing DOM element to a local offset above/near an anchor mesh.
export function attachLabel(anchorObject, offset, el) {
  const label = new CSS2DObject(el);
  label.position.copy(offset);
  anchorObject.add(label);
  return label;
}

export function makeStatBox(title) {
  const el = document.createElement('div');
  el.className = 'stat-box';
  const titleEl = document.createElement('div');
  titleEl.className = 'stat-title';
  titleEl.textContent = title;
  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = '--';
  el.appendChild(titleEl);
  el.appendChild(valueEl);
  return { el, valueEl };
}
