import * as THREE from 'three';
import { theme } from './theme.js';

/**
 * Weather presets drive sky colour, fog, lighting and precipitation. Values are
 * eased toward the target every frame, so switching weather is a transition rather
 * than a cut.
 *
 * Behaviour lives here; the colours come from the active theme
 * (`theme.scene.weather[id]`), so a theme restyles the sky without touching this file.
 */
export const WEATHER_PRESETS = [
  {
    id: 'clear',
    label: 'Clear',
    icon: '☀️',
    fog: [45, 190],
    sunIntensity: 2.0,
    hemiIntensity: 1.15,
    ambientIntensity: 0.25,
    ground: 'grass',
  },
  {
    id: 'cloudy',
    label: 'Overcast',
    icon: '☁️',
    fog: [35, 150],
    sunIntensity: 0.5,
    hemiIntensity: 1.05,
    ambientIntensity: 0.5,
    ground: 'grass',
  },
  {
    id: 'rain',
    label: 'Rain',
    icon: '\u{1F327}️',
    fog: [22, 100],
    sunIntensity: 0.28,
    hemiIntensity: 0.8,
    ambientIntensity: 0.42,
    ground: 'wet',
    precip: { type: 'rain', count: 2600, speed: 22, wind: 2.5 },
  },
  {
    id: 'storm',
    label: 'Thunder',
    icon: '⛈️',
    fog: [16, 78],
    sunIntensity: 0.18,
    hemiIntensity: 0.6,
    ambientIntensity: 0.34,
    ground: 'wet',
    precip: { type: 'rain', count: 3600, speed: 28, wind: 6.5 },
    lightning: true,
  },
  {
    id: 'snow',
    label: 'Snow',
    icon: '❄️',
    fog: [20, 90],
    sunIntensity: 0.55,
    hemiIntensity: 1.15,
    ambientIntensity: 0.55,
    ground: 'snow',
    precip: { type: 'snow', count: 1800, speed: 1.6, wind: 1.2 },
  },
  {
    id: 'fog',
    label: 'Fog',
    icon: '\u{1F32B}️',
    fog: [4, 38],
    sunIntensity: 0.3,
    hemiIntensity: 0.95,
    ambientIntensity: 0.55,
    ground: 'grass',
  },
];

const FIELD_RADIUS = 22; // precipitation box half-width around the player
const FIELD_TOP = 22;
const FIELD_BOTTOM = -6;

function rainTexture() {
  // Wide canvas, narrow streak: point sprites are square, so the drop's slenderness
  // has to come from how little of the texture it fills.
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(205,225,250,0)');
  grad.addColorStop(0.45, 'rgba(205,225,250,0.8)');
  grad.addColorStop(1, 'rgba(205,225,250,0)');
  g.fillStyle = grad;
  g.fillRect(15, 0, 2, 64);
  return new THREE.CanvasTexture(c);
}

function snowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** A field of falling particles that follows the player. */
class Precipitation {
  constructor(count, { size, texture, speed, wind, sway }) {
    this.count = count;
    this.speed = speed;
    this.wind = wind;
    this.sway = sway;

    const positions = new Float32Array(count * 3);
    this.phases = new Float32Array(count);
    this.rates = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * FIELD_RADIUS;
      positions[i * 3 + 1] = FIELD_BOTTOM + Math.random() * (FIELD_TOP - FIELD_BOTTOM);
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * FIELD_RADIUS;
      this.phases[i] = Math.random() * Math.PI * 2;
      this.rates[i] = 0.75 + Math.random() * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // The field is re-centred on the player every frame, so frustum culling would
    // cull it against a stale bounding sphere.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FIELD_RADIUS * 2);

    this.material = new THREE.PointsMaterial({
      size,
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.visible = false;
    this.points.renderOrder = 2;
  }

  update(dt, elapsed, cameraPos) {
    const pos = this.points.geometry.attributes.position;
    const arr = pos.array;
    const span = FIELD_TOP - FIELD_BOTTOM;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      arr[i3 + 1] -= this.speed * this.rates[i] * dt;
      arr[i3] += this.wind * dt;
      if (this.sway) {
        arr[i3 + 2] += Math.sin(elapsed * 1.5 + this.phases[i]) * this.sway * dt;
      }

      if (arr[i3 + 1] < FIELD_BOTTOM) {
        arr[i3 + 1] += span;
        arr[i3] = (Math.random() * 2 - 1) * FIELD_RADIUS;
        arr[i3 + 2] = (Math.random() * 2 - 1) * FIELD_RADIUS;
      }
      if (arr[i3] > FIELD_RADIUS) arr[i3] -= FIELD_RADIUS * 2;
      if (arr[i3 + 2] > FIELD_RADIUS) arr[i3 + 2] -= FIELD_RADIUS * 2;
      else if (arr[i3 + 2] < -FIELD_RADIUS) arr[i3 + 2] += FIELD_RADIUS * 2;
    }

    pos.needsUpdate = true;
    this.points.position.set(cameraPos.x, 0, cameraPos.z);
  }
}

export class Weather {
  /** `onGroundStyle` is called with the preset's ground style id on every change. */
  constructor(scene, { sky, sun, hemi, ambient }, onGroundStyle) {
    this.scene = scene;
    this.sky = sky;
    this.sun = sun;
    this.hemi = hemi;
    this.ambient = ambient;
    this.onGroundStyle = onGroundStyle;

    this.rain = new Precipitation(3600, {
      size: 0.7,
      texture: rainTexture(),
      speed: 22,
      wind: 2.5,
      sway: 0,
    });
    this.snow = new Precipitation(1800, {
      size: 0.13,
      texture: snowTexture(),
      speed: 1.6,
      wind: 1.2,
      sway: 0.9,
    });
    scene.add(this.rain.points, this.snow.points);

    this.skyTop = new THREE.Color();
    this.skyHorizon = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.flash = 0;

    this.preset = WEATHER_PRESETS[0];
    this.apply(WEATHER_PRESETS[0].id, true);
  }

  get currentId() {
    return this.preset.id;
  }

  /** Theme colours for a preset, falling back to the first one if a theme omits it. */
  _colors(id) {
    const table = theme.scene.weather;
    return table[id] ?? Object.values(table)[0];
  }

  apply(id, immediate = false) {
    const preset = WEATHER_PRESETS.find((p) => p.id === id) ?? WEATHER_PRESETS[0];
    this.preset = preset;

    const active = preset.precip;
    for (const [type, field] of [['rain', this.rain], ['snow', this.snow]]) {
      const on = active?.type === type;
      field.points.visible = on;
      field.targetOpacity = on ? (type === 'rain' ? 0.5 : 0.85) : 0;
      if (on) {
        field.speed = active.speed;
        field.wind = active.wind;
      }
      if (immediate) field.material.opacity = field.targetOpacity;
    }

    if (immediate) {
      const colors = this._colors(preset.id);
      this.skyTop.set(colors.skyTop);
      this.skyHorizon.set(colors.skyHorizon);
      this.sunColor.set(colors.sunColor);
      this.sun.intensity = preset.sunIntensity;
      this.hemi.intensity = preset.hemiIntensity;
      this.ambient.intensity = preset.ambientIntensity;
      this.scene.fog.near = preset.fog[0];
      this.scene.fog.far = preset.fog[1];
      this._push();
    }

    this.onGroundStyle?.(preset.ground);
  }

  update(dt, elapsed, cameraPos) {
    const p = this.preset;
    const k = 3.2; // easing rate for weather transitions
    const colors = this._colors(p.id);

    this.skyTop.lerp(new THREE.Color(colors.skyTop), Math.min(dt * k, 1));
    this.skyHorizon.lerp(new THREE.Color(colors.skyHorizon), Math.min(dt * k, 1));
    this.sunColor.lerp(new THREE.Color(colors.sunColor), Math.min(dt * k, 1));

    this.sun.intensity = THREE.MathUtils.damp(this.sun.intensity, p.sunIntensity, k, dt);
    this.hemi.intensity = THREE.MathUtils.damp(this.hemi.intensity, p.hemiIntensity, k, dt);
    this.ambient.intensity = THREE.MathUtils.damp(this.ambient.intensity, p.ambientIntensity, k, dt);
    this.scene.fog.near = THREE.MathUtils.damp(this.scene.fog.near, p.fog[0], k, dt);
    this.scene.fog.far = THREE.MathUtils.damp(this.scene.fog.far, p.fog[1], k, dt);

    for (const field of [this.rain, this.snow]) {
      field.material.opacity = THREE.MathUtils.damp(
        field.material.opacity,
        field.targetOpacity ?? 0,
        5,
        dt
      );
      if (field.material.opacity < 0.01 && field.targetOpacity === 0) {
        field.points.visible = false;
      } else if (field.targetOpacity > 0) {
        field.points.visible = true;
        field.update(dt, elapsed, cameraPos);
      }
    }

    // Lightning: a short double-flash at random intervals.
    if (p.lightning) {
      if (this.flash <= 0 && Math.random() < dt * 0.22) this.flash = 1;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.5);
    const boost = this.flash > 0 ? Math.pow(this.flash, 2) * (this.flash > 0.65 ? 1 : 0.45) : 0;

    this._push(boost);
  }

  _push(boost = 0) {
    const top = this.skyTop.clone();
    const horizon = this.skyHorizon.clone();
    if (boost > 0) {
      const white = new THREE.Color(0xffffff);
      top.lerp(white, boost * 0.8);
      horizon.lerp(white, boost * 0.8);
    }
    this.sky.material.uniforms.top.value.copy(top);
    this.sky.material.uniforms.horizon.value.copy(horizon);
    this.scene.fog.color.copy(horizon);
    this.sun.color.copy(this.sunColor);
    if (boost > 0) {
      this.ambient.intensity += boost * 2.2;
      this.hemi.intensity += boost * 1.4;
    }
  }
}
