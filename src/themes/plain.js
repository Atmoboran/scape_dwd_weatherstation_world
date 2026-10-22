/**
 * Plain theme - the neutral dark-HUD look the app had before the SCAPE° design,
 * kept as a second implementation of the theme contract so the design layer is
 * demonstrably interchangeable. Load it with `?theme=plain`.
 */
export default {
  id: 'plain',
  label: 'Plain',
  lang: 'en',

  fontStack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontNote: '',

  brand: {
    wordmark: 'Meteo Instrument Walk',
    subtitle: [],
    shortMark: 'M',
    claim: '',
  },

  cssVars: {
    '--radius': '12px',
    '--blur': 'blur(8px)',
    '--shadow': '0 -18px 50px rgba(0,0,0,0.5)',
    '--panel-bg': 'rgba(12, 17, 25, 0.86)',
    '--panel-bg-alt': '#0d1219',
    '--panel-text': '#eaf0f8',
    '--panel-muted': '#93a2b8',
    '--stroke': 'rgba(255,255,255,0.14)',
    '--stroke-strong': 'rgba(255,255,255,0.3)',
    '--accent': '#5fb0ff',
    '--accent-text': '#05121f',
    '--mark-bg': 'rgba(255,255,255,0.1)',
    '--mark-text': '#eaf0f8',
    '--chip-bg': 'rgba(255,255,255,0.07)',
    '--btn-bg': '#5fb0ff',
    '--btn-text': '#05121f',
    '--bar-track': 'rgba(255,255,255,0.1)',
    '--bar-fill': '#5fb0ff',
    '--overlay-bg': '#0b1018',
    '--overlay-text': '#eaf0f8',
    '--pip-off': 'rgba(255,255,255,0.18)',
    '--minimap-bg': 'rgba(10,16,24,0.75)',
    '--minimap-ring': 'rgba(255,255,255,0.12)',
    '--minimap-player': '#ffffff',
    '--crosshair': 'rgba(255,255,255,0.75)',
    '--crosshair-ring': 'rgba(0,0,0,0.35)',
    '--touch-stroke': 'rgba(255,255,255,0.28)',
    '--touch-fill': 'rgba(255,255,255,0.10)',
    '--touch-knob': 'rgba(255,255,255,0.82)',
    '--touch-text': 'rgba(255,255,255,0.78)',
    '--letter-spacing-label': '0.14em',
    '--headline-weight': '650',
  },

  poster: { fields: [], shapes: [] },

  strings: {
    loadingPrep: 'preparing the field…',
    loadingStations: (n, total) => `loading stations… ${n}/${total}`,
    loadFailed: 'failed to load models - check the console',

    startHeadline: ['Meteo', 'Instrument Walk'],
    startIntro:
      'Eight meteorological stations, scanned from CAD and scattered across a field. ' +
      'Walk out and inspect every one.',
    startButton: 'Enter the field',

    controlsTouch: [
      ['Left', 'drag the stick to walk'],
      ['Right', 'drag anywhere to look around'],
      ['Run', 'tap to toggle sprint'],
      ['Tap', 'the prompt to inspect a station'],
      ['☁', 'top right changes the weather'],
    ],
    controlsDesktop: [
      ['W A S D', 'walk'],
      ['Mouse', 'look around'],
      ['Shift', 'run'],
      ['E', 'inspect a station'],
      ['C', 'change the weather'],
      ['Esc', 'release cursor'],
    ],

    foundLabel: 'Stations found',
    interact: 'Inspect',
    distance: (m) => `${m} m away`,
    here: 'you are here',

    hintTitle: (total) => `Find all ${total} stations`,
    hintSub: 'Walk up to one to log it',
    foundToast: (name) => `Logged: ${name}`,
    remaining: (n) => (n === 1 ? '1 station left' : `${n} stations left`),
    allFound: 'Every station logged!',
    completeTitle: 'Field survey complete',
    completeSub: 'Nice walk.',

    panelSource: (s) => `Source model: ${s}`,
    panelNoDescription: 'No description recorded yet.',
    statHeight: 'Height',
    statFootprint: 'Footprint',
    panelClose: 'Close',

    weatherTitle: 'Weather',
    weatherAria: 'Weather settings',
    weatherLabels: {
      clear: 'Clear',
      cloudy: 'Overcast',
      rain: 'Rain',
      storm: 'Thunder',
      snow: 'Snow',
      fog: 'Fog',
    },
  },

  scene: {
    stationPalette: [
      '#4fa3ff',
      '#ffb04f',
      '#6ee7a8',
      '#ff7a9c',
      '#c08cff',
      '#ffe066',
      '#57d4e8',
      '#ff9a5a',
    ],
    stationTint: { target: '#9aa3ad', mix: 0.84 },
    stationMaterial: { metalness: 0.45, roughness: 0.5 },
    hemisphere: { sky: '#dfefff', ground: '#4a5a3a' },

    groundStyles: {
      grass: { base: '#8ba869', speck: '#6b8a4d' },
      wet: { base: '#6f8a55', speck: '#53683e' },
      snow: { base: '#eef3f7', speck: '#d3dde6' },
    },
    decals: { enabled: false, rectCount: 0, circleCount: 0, palette: [] },
    apron: { color: '#b9ae98', scale: 1.3 },
    shadowOpacity: 0.42,

    weather: {
      clear: { skyTop: '#3f7fc4', skyHorizon: '#cfe2f2', sunColor: '#fff4e0' },
      cloudy: { skyTop: '#8b9dad', skyHorizon: '#c3ccd4', sunColor: '#e8eef5' },
      rain: { skyTop: '#59656f', skyHorizon: '#8c979e', sunColor: '#c9d4de' },
      storm: { skyTop: '#353d46', skyHorizon: '#646d76', sunColor: '#b6c2cd' },
      snow: { skyTop: '#93a4b3', skyHorizon: '#dde5ea', sunColor: '#eef4ff' },
      fog: { skyTop: '#b3bcc2', skyHorizon: '#ccd3d7', sunColor: '#dfe6ea' },
    },
  },
};
