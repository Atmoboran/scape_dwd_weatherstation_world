import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const MOVE_SPEED = 4.0; // meters/second
const EYE_HEIGHT = 1.7;
const LOOK_SENSITIVITY = 0.0035;

export const isMobile = matchMedia('(pointer: coarse)').matches;

export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.camera.position.set(0, EYE_HEIGHT, 8);
    this.yaw = 0;
    this.pitch = 0;

    this.moveInput = new THREE.Vector2(0, 0); // x = strafe, y = forward, both in [-1, 1]
    this.velocity = new THREE.Vector3();

    if (isMobile) {
      document.body.classList.add('mobile');
      this._setupTouch();
    } else {
      document.body.classList.add('desktop');
      this.pointerLock = new PointerLockControls(camera, domElement);
      this.pointerLock.addEventListener('lock', () => document.body.classList.add('locked'));
      this.pointerLock.addEventListener('unlock', () => document.body.classList.remove('locked'));
      document.getElementById('tap-to-start').addEventListener('click', () => this.pointerLock.lock());
      this._setupKeyboard();
    }
  }

  _setupKeyboard() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _setupTouch() {
    const joystickZone = document.getElementById('joystick-zone');
    const lookZone = document.getElementById('look-zone');

    let joystickTouchId = null;
    let joystickOrigin = new THREE.Vector2();
    joystickZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      joystickTouchId = t.identifier;
      joystickOrigin.set(t.clientX, t.clientY);
    });
    joystickZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joystickTouchId) continue;
        const dx = t.clientX - joystickOrigin.x;
        const dy = t.clientY - joystickOrigin.y;
        const maxRadius = 50;
        this.moveInput.set(
          THREE.MathUtils.clamp(dx / maxRadius, -1, 1),
          THREE.MathUtils.clamp(-dy / maxRadius, -1, 1)
        );
      }
      e.preventDefault();
    }, { passive: false });
    const endJoystick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joystickTouchId) {
          joystickTouchId = null;
          this.moveInput.set(0, 0);
        }
      }
    };
    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);

    let lookTouchId = null;
    let lastLook = new THREE.Vector2();
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lastLook.set(t.clientX, t.clientY);
    });
    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookTouchId) continue;
        const dx = t.clientX - lastLook.x;
        const dy = t.clientY - lastLook.y;
        lastLook.set(t.clientX, t.clientY);
        this.yaw -= dx * LOOK_SENSITIVITY * 2.2;
        this.pitch -= dy * LOOK_SENSITIVITY * 2.2;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
      }
      e.preventDefault();
    }, { passive: false });
    const endLook = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookTouchId) lookTouchId = null;
      }
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);
  }

  _desktopMoveInput() {
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }

  /** Advances the player by `dt` seconds, resolves collisions, returns nothing (mutates camera). */
  update(dt, resolveCollisions) {
    let forward, strafe;
    if (isMobile) {
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      forward = this.moveInput.y;
      strafe = this.moveInput.x;
    } else {
      ({ forward, strafe } = this._desktopMoveInput());
    }

    if (forward !== 0 || strafe !== 0) {
      const len = Math.hypot(forward, strafe) || 1;
      const f = (forward / len) * MOVE_SPEED * dt;
      const s = (strafe / len) * MOVE_SPEED * dt;

      if (isMobile) {
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));
        this.camera.position.addScaledVector(dir, f);
        this.camera.position.addScaledVector(right, s);
      } else {
        this.pointerLock.moveForward(f);
        this.pointerLock.moveRight(s);
      }
    }

    this.camera.position.y = EYE_HEIGHT;
    resolveCollisions(this.camera.position);
  }
}
