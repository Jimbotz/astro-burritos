'use client'

import { useSyncExternalStore } from 'react'

// Browser facts read without effects (useSyncExternalStore): the server snapshot is the safe default, so hydration
// never mismatches and the value updates right after.

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  const query = matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True when the user asked the system to reduce motion (globe and projection then start paused). */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => matchMedia(REDUCED_MOTION).matches, () => false)
}

let webglSupport: boolean | undefined
function detectWebGL() {
  if (webglSupport !== undefined) return webglSupport
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    webglSupport = Boolean(gl)
  } catch {
    webglSupport = false
  }
  return webglSupport
}
const subscribeNothing = () => () => {}

/** Forget the cached answer, so the next render checks WebGL again (the globe's "Retry" button). */
export function recheckWebGLSupport() {
  webglSupport = undefined
}

/** null on the server, then whether this browser can create a WebGL context (checked once). */
export function useWebGLSupport(): boolean | null {
  return useSyncExternalStore(subscribeNothing, detectWebGL, () => null)
}
