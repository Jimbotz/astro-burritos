'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { GlobeMethods } from 'react-globe.gl'
import type { Region } from '@/components/location-selector'
import { ZoomControl } from '@/components/zoom-control'
import { recheckWebGLSupport, useReducedMotion, useWebGLSupport } from '@/hooks/use-browser'
import { useCountries, useStates, type CountryFeature, type StateFeature } from '@/lib/geo'

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false, loading: () => <div className="globe-loading" role="status">Preparing interactive Earth…</div> })

// WebGL needs literal colors, not CSS variables: neon-yellow, blue-yonder and white from the brand theme.
const POINT_COLOR = '#EAFE07'
const ATMOSPHERE_COLOR = '#2E96F5'
// Ocean specular tints for the enhanced profile (physical shading, not UI colors).
const OCEAN_SPECULAR_LOADING = '#102435' // muted until the water mask arrives, so the whole sphere doesn't shine
const OCEAN_SPECULAR = '#18334a'
// DAY/NIGHT — disabled 2026-11-14, kept for later. The city lights in earth-night.jpg are 1–2-texel dots on a
// dim blue night-Earth; at globe zoom mipmapping averages them away, so the night side read as plain dark.
// To re-enable: uncomment these constants, the night block in installGlobeEnhancements and the lighting
// branch in the `ready` effect, ideally with a black-background city-lights texture (e.g. NASA Black Marble).
// const NIGHT_AMBIENT_TINT = '#6d8fbd'
// const SUN_TINT = '#fff4dd'
// // Fixed world-space sun. Puebla's default view lands on the day side (dot ≈ 0.70).
// const SUN_POSITION = new THREE.Vector3(-140, 80, 120)
// The enhanced profile renders at up to 2× device pixels; the basic one stays at 1.5× (≈44% fewer pixels).
const MAX_PIXEL_RATIO = 2
const BASIC_PIXEL_RATIO = 1.5
// Zoom is expressed against the default view: camera altitude (in globe radii) = BASE_ALTITUDE / zoom.
const BASE_ALTITUDE = 1.7
const GLOBE_ZOOM = { min: 0.5, max: 16 }
// ponytail: tuned by eye on the light theme; raise for more relief, lower if land washes out.
const SUN_INTENSITY = 0.5 * Math.PI
const EARTH_TEXTURE_2K = '/textures/earth-blue-marble.jpg'
const EARTH_TEXTURE_4K = '/textures/earth-blue-marble-4k.jpg'
const CAP_COLOR = 'rgba(255, 255, 255, 0.02)'
const HOVER_CAP_COLOR = 'rgba(46, 150, 245, 0.4)'
const SELECTED_CAP_COLOR = 'rgba(234, 254, 7, 0.35)'
const STROKE_COLOR = 'rgba(255, 255, 255, 0.6)'
// Accessors must be functions: a bare string is read as a property name of each feature, not as a color.
const strokeColor = () => STROKE_COLOR
const noSideWalls = () => '' // falsy: flat caps, no extruded sides

type Area = CountryFeature | StateFeature
const isState = (area: Area): area is StateFeature => 'adm0_a3' in area.properties
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pointColor = () => POINT_COLOR
const ringColor = () => (t: number) => `rgba(234, 254, 7, ${Math.max(0, 0.72 * (1 - t))})`

type NavigatorPerformanceHints = Navigator & {
  deviceMemory?: number
  connection?: { effectiveType?: string; saveData?: boolean }
}

type VisualProfile = {
  earthTextureUrl: string
  enhancedEffects: boolean
}

function selectVisualProfile(globeWidth: number): VisualProfile {
  const hints = navigator as NavigatorPerformanceHints
  const connection = hints.connection
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  const displayPixels = Math.max(window.screen.width, window.screen.height) * pixelRatio
  const renderedGlobePixels = globeWidth * pixelRatio
  const memory = hints.deviceMemory ?? (navigator.hardwareConcurrency <= 4 ? 4 : 8)
  const constrainedNetwork = connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')
  const benefitsFrom4K = displayPixels >= 1800 && renderedGlobePixels >= 650

  const use4K = benefitsFrom4K && memory >= 4 && !constrainedNetwork
  return {
    earthTextureUrl: use4K ? EARTH_TEXTURE_4K : EARTH_TEXTURE_2K,
    enhancedEffects: use4K && memory > 4,
  }
}

async function installGlobeEnhancements(globe: GlobeMethods, earthMaterial: THREE.MeshPhongMaterial) {
  const scene = globe.scene()
  const resolvedEarthMaterial = earthMaterial

  const previousMaterial = {
    specularMap: resolvedEarthMaterial.specularMap,
    specular: resolvedEarthMaterial.specular.clone(),
    shininess: resolvedEarthMaterial.shininess,
    bumpScale: resolvedEarthMaterial.bumpScale,
  }
  // Prevent the default material from showing a broad full-sphere highlight while maps load.
  resolvedEarthMaterial.specular.set(OCEAN_SPECULAR_LOADING)
  resolvedEarthMaterial.shininess = 72
  resolvedEarthMaterial.bumpScale = 2.2
  resolvedEarthMaterial.needsUpdate = true

  const loader = new THREE.TextureLoader()
  let waterTexture: THREE.Texture
  // let nightTexture: THREE.Texture // DAY/NIGHT (disabled)
  let cloudTexture: THREE.Texture
  try {
    [waterTexture, cloudTexture] = await Promise.all([
      loader.loadAsync('/textures/earth-water.png'),
      // loader.loadAsync('/textures/earth-night.jpg'), // DAY/NIGHT (disabled)
      loader.loadAsync('/textures/earth-clouds-4k.webp'),
    ])
  } catch (error) {
    resolvedEarthMaterial.specularMap = previousMaterial.specularMap
    resolvedEarthMaterial.specular.copy(previousMaterial.specular)
    resolvedEarthMaterial.shininess = previousMaterial.shininess
    resolvedEarthMaterial.bumpScale = previousMaterial.bumpScale
    resolvedEarthMaterial.needsUpdate = true
    throw error
  }
  const anisotropy = Math.min(globe.renderer().capabilities.getMaxAnisotropy(), 8)
  for (const texture of [waterTexture, cloudTexture]) texture.anisotropy = anisotropy
  // nightTexture.colorSpace = THREE.SRGBColorSpace // DAY/NIGHT (disabled)
  cloudTexture.colorSpace = THREE.SRGBColorSpace

  resolvedEarthMaterial.specularMap = waterTexture
  resolvedEarthMaterial.specular.set(OCEAN_SPECULAR)
  resolvedEarthMaterial.shininess = 72
  resolvedEarthMaterial.bumpScale = 2.2
  resolvedEarthMaterial.needsUpdate = true

  const radius = globe.getGlobeRadius()
  /* DAY/NIGHT (disabled 2026-11-14) — city-lights shader sphere; see the note at the top of the file.
  const sunDirection = SUN_POSITION.clone().normalize()
  const nightMaterial = new THREE.ShaderMaterial({
    uniforms: { nightMap: { value: nightTexture }, sunDirection: { value: sunDirection } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D nightMap;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vec3 nightColor = texture2D(nightMap, vUv).rgb;
        float darkness = 1.0 - smoothstep(-0.08, 0.2, dot(normalize(vWorldNormal), normalize(sunDirection)));
        float lightMask = smoothstep(0.08, 0.72, max(nightColor.r, max(nightColor.g, nightColor.b)));
        gl_FragColor = vec4(nightColor * 1.45, darkness * lightMask * 0.82);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const nightMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, 96, 96), nightMaterial)
  nightMesh.renderOrder = -2
  nightMesh.rotation.y = -Math.PI / 2
  */

  // Overlays draw before the polygon layer (renderOrder 0) and never write depth, so country/state
  // borders, hover caps, rings and the point stay readable on top of the clouds.
  // three-globe turns its globe mesh by -90° on Y (prime meridian along +Z); overlay spheres must match,
  // or clouds (and city lights) land 90° of longitude away from the land they belong to.
  const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    alphaTest: 0.04,
  })
  const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 96, 96), cloudMaterial)
  cloudMesh.renderOrder = -1
  cloudMesh.rotation.y = -Math.PI / 2 // same alignment as the globe; the drift loop rotates from here
  scene.add(cloudMesh) // DAY/NIGHT (disabled): scene.add(nightMesh, cloudMesh)

  return {
    cloudMesh,
    dispose() {
      scene.remove(cloudMesh) // DAY/NIGHT (disabled): scene.remove(nightMesh, cloudMesh)
      // nightMesh.geometry.dispose() // DAY/NIGHT (disabled)
      // nightMaterial.dispose()
      // nightTexture.dispose()
      cloudMesh.geometry.dispose()
      cloudMaterial.dispose()
      cloudTexture.dispose()
      waterTexture.dispose()
      resolvedEarthMaterial.specularMap = previousMaterial.specularMap
      resolvedEarthMaterial.specular.copy(previousMaterial.specular)
      resolvedEarthMaterial.shininess = previousMaterial.shininess
      resolvedEarthMaterial.bumpScale = previousMaterial.bumpScale
      resolvedEarthMaterial.needsUpdate = true
    },
  }
}

export function EarthGlobe({ region, paused, resetSignal, onSelect }: { region: Region; paused: boolean; resetSignal: number; onSelect: (region: Region) => void }) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cloudMeshRef = useRef<THREE.Mesh | null>(null)
  const renderActiveRef = useRef(true)
  const webgl = useWebGLSupport()
  const [, setWebglRetries] = useState(0)
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [visualProfile, setVisualProfile] = useState<VisualProfile | null>(null)
  // Pick once after the canvas has a real size, avoiding a wasteful 2K-to-4K texture swap (adjusted during render).
  if (size.width > 0 && !visualProfile) setVisualProfile(selectVisualProfile(size.width))
  const earthMaterial = useMemo(() => new THREE.MeshPhongMaterial({ color: 0x000000, specular: new THREE.Color(OCEAN_SPECULAR_LOADING), shininess: 72 }), [])
  const [hovered, setHovered] = useState<Area | null>(null)
  const [zoom, setZoom] = useState(1)
  // The selection rings pulse even while rotation is paused (selecting pauses it); only reduced motion hides them.
  const reducedMotion = useReducedMotion()
  const positioned = useRef(false)
  const lastReset = useRef(resetSignal)
  const countries = useCountries().data?.features
  const states = useStates(region.country).data?.features

  // Render at the container's size instead of a fixed canvas.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }))
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // Stop the render loop while the globe is off-screen or the tab is hidden.
  // Re-subscribes on `ready`: a new IntersectionObserver fires once immediately, so a globe that
  // starts below the fold (mobile) gets paused even if its visibility never changes afterwards.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !ready) return
    let onScreen = true
    const sync = () => {
      const globe = globeRef.current
      if (!globe) return
      renderActiveRef.current = onScreen && !document.hidden
      if (renderActiveRef.current) globe.resumeAnimation()
      else globe.pauseAnimation()
    }
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
    observer.observe(wrap)
    document.addEventListener('visibilitychange', sync)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [ready])

  // onGlobeReady can fire before the ref is attached, so ref-based setup runs in effects keyed on `ready`.
  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe || !visualProfile) return
    const enhanced = visualProfile.enhancedEffects
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, enhanced ? MAX_PIXEL_RATIO : BASIC_PIXEL_RATIO))
    const [ambient, sun] = globe.lights()
    /* DAY/NIGHT (disabled 2026-11-14) — enhanced-profile lighting; see the note at the top of the file.
    if (enhanced) {
      // A dim cool fill and a fixed world-space sun; the city-lights shader lights the night side.
      ambient.color.set(NIGHT_AMBIENT_TINT)
      ambient.intensity = 0.34 * Math.PI
      sun.color.set(SUN_TINT)
      sun.intensity = 1.18 * Math.PI
      sun.position.copy(SUN_POSITION)
      globe.scene().add(sun)
      return
    }
    */
    // globe.gl ships a grey ambient plus a sun over the north pole (visible face at ~60% of the texture);
    // a white ambient shows the texture at full strength and a camera-riding sun keeps the relief
    // (and puts the ocean glint where the viewer looks).
    ambient.color.setScalar(1)
    ambient.intensity = Math.PI
    sun.intensity = SUN_INTENSITY
    sun.position.set(-150, 150, 0)
    globe.camera().add(sun)
    globe.scene().add(globe.camera())
  }, [ready, visualProfile])

  useEffect(() => {
    if (!ready || !visualProfile?.enhancedEffects || !globeRef.current) return
    let cancelled = false
    let dispose: (() => void) | undefined
    installGlobeEnhancements(globeRef.current, earthMaterial).then((enhancements) => {
      if (cancelled) return enhancements.dispose()
      cloudMeshRef.current = enhancements.cloudMesh
      dispose = enhancements.dispose
    }).catch((error) => {
      if (!cancelled) console.warn('Optional globe enhancements could not be loaded.', error)
    })
    return () => {
      cancelled = true
      cloudMeshRef.current = null
      dispose?.()
    }
  }, [earthMaterial, ready, visualProfile?.enhancedEffects])

  useEffect(() => {
    if (!visualProfile?.enhancedEffects) return
    let frame = 0
    let previous = performance.now()
    const rotateClouds = (now: number) => {
      const elapsed = Math.min(now - previous, 50)
      previous = now
      if (!paused && renderActiveRef.current && cloudMeshRef.current) cloudMeshRef.current.rotation.y -= elapsed * 0.000006
      frame = requestAnimationFrame(rotateClouds)
    }
    frame = requestAnimationFrame(rotateClouds)
    return () => cancelAnimationFrame(frame)
  }, [paused, visualProfile?.enhancedEffects])

  useEffect(() => {
    if (!ready || !globeRef.current) return
    const globe = globeRef.current
    globe.controls().autoRotate = !paused
    globe.controls().autoRotateSpeed = 0.32
  }, [paused, ready])

  // Wheel/pinch zoom stops at the same limits as the slider (camera distance = radius × (1 + altitude)).
  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe) return
    const radius = globe.getGlobeRadius()
    globe.controls().minDistance = radius * (1 + BASE_ALTITUDE / GLOBE_ZOOM.max)
    globe.controls().maxDistance = radius * (1 + BASE_ALTITUDE / GLOBE_ZOOM.min)
  }, [ready])

  // Fly to the selected point. A new selection keeps the current zoom, so you can zoom in once and
  // then hop between states; the first view and the reset button go back to 1×.
  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe) return
    const keepZoom = positioned.current && lastReset.current === resetSignal
    positioned.current = true
    lastReset.current = resetSignal
    globe.pointOfView({ lat: region.lat, lng: region.lon, altitude: keepZoom ? globe.pointOfView().altitude : BASE_ALTITUDE }, 750)
  }, [region.lat, region.lon, resetSignal, ready])

  // onZoom fires on every camera change, autorotate included; rounding makes the state update a no-op
  // unless the altitude really changed, so the slider follows the wheel without re-rendering every frame.
  const handleZoom = useCallback(({ altitude: cameraAltitude }: { altitude: number }) => setZoom(Number((BASE_ALTITUDE / cameraAltitude).toFixed(2))), [])
  const zoomTo = useCallback((next: number, animate: boolean) => {
    setZoom(next)
    globeRef.current?.pointOfView({ altitude: BASE_ALTITUDE / next }, animate ? 300 : 0)
  }, [])

  const handleReady = useCallback(() => setReady(true), [])
  const handleClick = useCallback(({ lat, lng }: { lat: number; lng: number }) => onSelect({ name: 'Selected coordinates', lat: Number(lat.toFixed(2)), lon: Number(lng.toFixed(2)) }), [onSelect])
  const points = useMemo(() => [{ lat: region.lat, lng: region.lon }], [region.lat, region.lon])

  // Countries everywhere, plus the selected country's states drawn just above them: one click picks a
  // country (and loads its states), the next picks a state. The clicked spot is the analysis point.
  const polygons = useMemo<Area[]>(() => [...(countries ?? []), ...(states ?? [])], [countries, states])
  const countryName = useCallback((code: string) => countries?.find((country) => country.properties.ADM0_A3 === code)?.properties.NAME ?? code, [countries])
  const isSelected = useCallback((area: Area) => isState(area) ? area.properties.adm0_a3 === region.country && area.properties.name === region.state : area.properties.ADM0_A3 === region.country && !region.state, [region.country, region.state])
  const capColor = useCallback((area: object) => area === hovered ? HOVER_CAP_COLOR : isSelected(area as Area) ? SELECTED_CAP_COLOR : CAP_COLOR, [hovered, isSelected])
  const altitude = useCallback((area: object) => (isState(area as Area) ? 0.012 : 0.006) + (area === hovered ? 0.006 : 0), [hovered])
  const label = useCallback((area: object) => {
    const feature = area as Area
    return escapeHtml(isState(feature) ? `${feature.properties.name} • ${countryName(feature.properties.adm0_a3)}` : feature.properties.NAME)
  }, [countryName])
  const handlePolygonClick = useCallback((area: object, _event: MouseEvent, { lat, lng }: { lat: number; lng: number }) => {
    const feature = area as Area
    const point = { lat: Number(lat.toFixed(2)), lon: Number(lng.toFixed(2)) }
    if (isState(feature)) onSelect({ name: `${feature.properties.name}, ${countryName(feature.properties.adm0_a3)}`, ...point, country: feature.properties.adm0_a3, state: feature.properties.name })
    else onSelect({ name: feature.properties.NAME, ...point, country: feature.properties.ADM0_A3 })
  }, [countryName, onSelect])
  const handlePolygonHover = useCallback((area: object | null) => setHovered(area as Area | null), [])

  return <>
  <div ref={wrapRef} className="globe-canvas" role="img" aria-label="Interactive Earth globe. Drag to rotate, scroll to zoom, click a country and then a state to select it.">
    {webgl === false
      ? <div className="globe-fallback" role="alert"><div className="fallback-globe"><GlobeFallbackIcon /></div><p>Interactive globe unavailable</p><span>Your browser could not start WebGL. Use the location selector to explore a region.</span><button type="button" onClick={() => { recheckWebGLSupport(); setWebglRetries((count) => count + 1) }}>Retry globe</button></div>
      : webgl && size.width > 0 && visualProfile && <Globe ref={globeRef} width={size.width} height={size.height} backgroundColor="rgba(0,0,0,0)" globeImageUrl={visualProfile.earthTextureUrl} bumpImageUrl={visualProfile.enhancedEffects ? '/textures/earth-topology.png' : '/textures/earth-topology.jpg'} globeMaterial={earthMaterial} showAtmosphere atmosphereColor={ATMOSPHERE_COLOR} atmosphereAltitude={visualProfile.enhancedEffects ? 0.18 : 0.2} onGlobeReady={handleReady} onGlobeClick={handleClick} onZoom={handleZoom} polygonsData={polygons} polygonCapColor={capColor} polygonSideColor={noSideWalls} polygonStrokeColor={strokeColor} polygonAltitude={altitude} polygonLabel={label} polygonsTransitionDuration={200} onPolygonClick={handlePolygonClick} onPolygonHover={handlePolygonHover} pointsData={points} pointAltitude={0.035} pointColor={pointColor} pointRadius={0.3} pointResolution={20} pointsTransitionDuration={550} ringsData={reducedMotion ? [] : points} ringAltitude={0.025} ringColor={ringColor} ringMaxRadius={2.5} ringPropagationSpeed={0.75} ringRepeatPeriod={1250} ringResolution={96} animateIn={false} />}
  </div>
  {/* Outside the role="img" canvas wrapper so it stays an operable control for assistive tech. */}
  {ready && webgl && <ZoomControl value={zoom} min={GLOBE_ZOOM.min} max={GLOBE_ZOOM.max} label="Globe zoom" onChange={zoomTo} />}
  </>
}

function GlobeFallbackIcon() { return <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="57" fill="none" stroke="currentColor" strokeWidth="2"/><ellipse cx="80" cy="80" rx="26" ry="57" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M26 80h108M37 53h86M37 107h86" fill="none" stroke="currentColor" strokeWidth="2"/></svg> }
