import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const WALK_SPEED = 4.2; // meters/second
const RUN_SPEED = 8.0;
const EYE_HEIGHT = 1.7;
const TOUCH_LOOK_SENSITIVITY = 0.0055;
const JOYSTICK_RADIUS = 46; // px of thumb travel for full deflection
const BOB_FREQUENCY = 9.5;
const BOB_AMPLITUDE = 0.055;

export const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

/**
 * First-person controller. Keyboard/mouse and touch are both always live, so a
 * touch laptop or a phone with a keyboard works either way.
 */
export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.yaw = 0;
    this.pitch = 0;
    this.moveInput = new THREE.Vector2(); // x = strafe, y = forward, each in [-1, 1]
    this.running = false;
    this.bobPhase = 0;
    this.enabled = false;
    this.keys = new Set();
    this.usingPointerLock = false;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 14);

    this._setupKeyboard();
    this._setupPointerLock();
    if (hasTouch) {
      document.body.classList.add('touch');
      this._setupTouch();
    }
  }

  get speed() {
    return this.running ? RUN_SPEED : WALK_SPEED;
  }

  /** Places the player before the walk begins. `yaw` of -PI/2 faces +X. */
  spawnAt(x, z, yaw) {
    this.position.set(x, EYE_HEIGHT, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, yaw, 0);
  }

  /** Called when the start overlay is dismissed. */
  start() {
    this.enabled = true;
    if (!hasTouch) this.controls.lock();
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.running = false;
    });
  }

  _setupPointerLock() {
    this.controls = new PointerLockControls(this.camera, this.domElement);
    this.controls.addEventListener('lock', () => {
      this.usingPointerLock = true;
      document.body.classList.add('locked');
    });
    this.controls.addEventListener('unlock', () => {
      this.usingPointerLock = false;
      document.body.classList.remove('locked');
    });
    // Clicking the canvas re-acquires the pointer after Esc / after closing a panel.
    this.domElement.addEventListener('click', () => {
      if (this.enabled && !hasTouch) this.controls.lock();
    });
  }

  _setupTouch() {
    const knob = document.getElementById('joystick-knob');
    const joystick = document.getElementById('joystick');
    const joystickHint = document.getElementById('joystick-hint');
    const lookHint = document.getElementById('look-hint');
    const sprintBtn = document.getElementById('sprint-btn');

    let moveId = null;
    let moveOrigin = new THREE.Vector2();
    const homeLeft = joystick.offsetLeft;
    const homeBottom = parseFloat(getComputedStyle(joystick).bottom);

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const moveZone = document.getElementById('joystick-zone');
    moveZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      moveId = t.identifier;
      moveOrigin.set(t.clientX, t.clientY);
      // Recentre the stick under the thumb so it works wherever the player grabs.
      joystick.style.left = `${t.clientX - joystick.offsetWidth / 2}px`;
      joystick.style.bottom = `${window.innerHeight - t.clientY - joystick.offsetHeight / 2}px`;
      joystickHint.classList.add('faded');
      e.preventDefault();
    }, { passive: false });

    moveZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== moveId) continue;
        const dx = THREE.MathUtils.clamp(t.clientX - moveOrigin.x, -JOYSTICK_RADIUS, JOYSTICK_RADIUS);
        const dy = THREE.MathUtils.clamp(t.clientY - moveOrigin.y, -JOYSTICK_RADIUS, JOYSTICK_RADIUS);
        this.moveInput.set(dx / JOYSTICK_RADIUS, -dy / JOYSTICK_RADIUS);
        setKnob(dx, dy);
      }
      e.preventDefault();
    }, { passive: false });

    const releaseStick = () => {
      moveId = null;
      this.moveInput.set(0, 0);
      setKnob(0, 0);
      joystick.style.left = `${homeLeft}px`;
      joystick.style.bottom = `${homeBottom}px`;
    };

    const endMove = (e) => {
      // `e.touches.length === 0` is the backstop: never keep walking once every
      // finger is off the glass, even if the id didn't match.
      if (e.touches.length === 0) {
        releaseStick();
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) releaseStick();
      }
    };
    moveZone.addEventListener('touchend', endMove);
    moveZone.addEventListener('touchcancel', endMove);

    let lookId = null;
    const lastLook = new THREE.Vector2();
    const lookZone = document.getElementById('look-zone');
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastLook.set(t.clientX, t.clientY);
      lookHint.classList.add('faded');
      e.preventDefault();
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.yaw -= (t.clientX - lastLook.x) * TOUCH_LOOK_SENSITIVITY;
        this.pitch -= (t.clientY - lastLook.y) * TOUCH_LOOK_SENSITIVITY;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
        lastLook.set(t.clientX, t.clientY);
      }
      e.preventDefault();
    }, { passive: false });

    const endLook = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) lookId = null;
      }
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);

    sprintBtn.addEventListener('touchstart', (e) => {
      this.running = !this.running;
      sprintBtn.classList.toggle('active', this.running);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  _keyboardInput() {
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }

  /** Advances the player by `dt` seconds and writes the result to the camera. */
  update(dt, resolveCollisions) {
    if (!this.enabled) return;

    // Touch look drives yaw/pitch directly; pointer lock drives the camera itself,
    // so read the camera back to keep a single source of truth for heading.
    if (this.usingPointerLock) {
      this.yaw = this.camera.rotation.y;
      this.pitch = this.camera.rotation.x;
    }

    const kb = this._keyboardInput();
    const forward = kb.forward || this.moveInput.y;
    const strafe = kb.strafe || this.moveInput.x;

    let moving = false;
    if (forward !== 0 || strafe !== 0) {
      const len = Math.max(Math.hypot(forward, strafe), 1);
      const step = this.speed * dt;
      const yawEuler = new THREE.Euler(0, this.yaw, 0);
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(yawEuler);
      const right = new THREE.Vector3(1, 0, 0).applyEuler(yawEuler);
      this.position.addScaledVector(dir, (forward / len) * step);
      this.position.addScaledVector(right, (strafe / len) * step);
      moving = true;
    }

    resolveCollisions(this.position);

    // Head bob: only while actually walking, eased back to rest otherwise.
    if (moving) {
      this.bobPhase += dt * BOB_FREQUENCY * (this.running ? 1.35 : 1);
    } else {
      this.bobPhase = 0;
    }
    const bob = moving ? Math.sin(this.bobPhase) * BOB_AMPLITUDE * (this.running ? 1.4 : 1) : 0;

    this.camera.position.set(this.position.x, EYE_HEIGHT + bob, this.position.z);
    if (!this.usingPointerLock) {
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }
  }
}
