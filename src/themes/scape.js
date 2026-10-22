/**
 * SCAPE° theme - corporate design for SCAPE°, Wetter Klima Mensch (Offenbach am Main).
 *
 * Follows the Bureau Mitte "Corporate Grundregeln": Founders Grotesk, caps for
 * headlines/labels and mixed case for running text, palette colours only (strong tones
 * always paired with pastels), black text, and the three-layer graphic system
 * (flat rectangular colour fields -> small solid shapes -> large cropped outlines).
 * Everything is flat: no gradients, shadows, blurs or rounded colour fields.
 *
 * Founders Grotesk is a commercial licence and is not shipped with this repo, so the
 * stack falls back to a neutral grotesk as the guide allows. See `fontNote`.
 */

const PALETTE = {
  black: '#000000',
  white: '#FFFFFF',
  orange: '#EE7518',
  orangeDeep: '#D55117',
  red: '#E8472E',
  yellow: '#FFED00',
  yellowPastel: '#FFF487',
  yellowPale: '#FDF6B7',
  cream: '#F2E4BA',
  gold: '#E09F00',
  navy: '#28348B',
  blue: '#3274BA',
  blueLight: '#98B8DD',
  ice: '#D4EDF8',
  lavender: '#E0E5F5',
  lilac: '#C5B8DB',
  purple: '#442683',
  purpleLight: '#523E91',
  green: '#00983A',
  greenMid: '#62BA91',
  mint: '#CFE6CE',
  mintPale: '#D0E8DC',
  teal: '#007B73',
  cyan: '#0097BE',
  cyanLight: '#44ABCC',
  pink: '#F8E1E6',
};

export default {
  id: 'scape',
  label: 'SCAPE°',
  lang: 'de',

  fontStack: '"Founders Grotesk", "Helvetica Neue", Inter, Arial, sans-serif',
  fontNote:
    'Founders Grotesk is a commercial licence and is not bundled; falling back to ' +
    'Helvetica Neue / Inter / Arial as the brand guide allows.',

  brand: {
    wordmark: 'SCAPE°',
    subtitle: ['WETTER', 'KLIMA', 'MENSCH'],
    shortMark: 'S°',
    claim: 'WETTER, KLIMA, WANDEL. WIR ERKLÄREN ES.',
  },

  // Applied to :root as custom properties. index.html references only these.
  cssVars: {
    '--radius': '0px',
    '--blur': 'none',
    '--shadow': 'none',
    '--panel-bg': PALETTE.cream,
    '--panel-bg-alt': PALETTE.ice,
    '--panel-text': PALETTE.black,
    '--panel-muted': '#4a4a4a',
    '--stroke': 'rgba(0,0,0,0.18)',
    '--stroke-strong': PALETTE.black,
    '--accent': PALETTE.orange,
    '--accent-text': PALETTE.black,
    '--mark-bg': PALETTE.yellow,
    '--mark-text': PALETTE.black,
    '--chip-bg': PALETTE.white,
    '--btn-bg': PALETTE.orange,
    '--btn-text': PALETTE.black,
    '--bar-track': 'rgba(0,0,0,0.15)',
    '--bar-fill': PALETTE.orange,
    '--overlay-bg': PALETTE.cream,
    '--overlay-text': PALETTE.black,
    '--pip-off': 'rgba(0,0,0,0.16)',
    '--minimap-bg': PALETTE.white,
    '--minimap-ring': 'rgba(0,0,0,0.18)',
    '--minimap-player': PALETTE.black,
    '--crosshair': 'rgba(0,0,0,0.55)',
    '--crosshair-ring': 'rgba(255,255,255,0.8)',
    '--touch-stroke': 'rgba(255,255,255,0.85)',
    '--touch-fill': 'rgba(255,255,255,0.22)',
    '--touch-knob': PALETTE.white,
    '--touch-text': PALETTE.white,
    '--letter-spacing-label': '0.16em',
    '--headline-weight': '400',
  },

  /**
   * Start screen built from the three-layer system.
   * `fields` stretch to the viewport (Layer 1); `shapes` keep their aspect and are
   * cropped by the format (Layers 2 and 3).
   */
  poster: {
    fields: [
      { tag: 'rect', attrs: { x: 0, y: 0, width: 100, height: 100, fill: PALETTE.cream } },
      { tag: 'rect', attrs: { x: 0, y: 0, width: 100, height: 32, fill: PALETTE.cyan } },
      { tag: 'rect', attrs: { x: 0, y: 74, width: 100, height: 26, fill: PALETTE.ice } },
      { tag: 'rect', attrs: { x: 0, y: 32, width: 26, height: 42, fill: PALETTE.yellowPastel } },
    ],
    // `shapes` are drawn with preserveAspectRatio="xMidYMid slice", which crops the
    // sides on a portrait phone and the top/bottom on a landscape desktop. Anything
    // that must stay visible lives inside roughly x 25-75, y 20-80; the Layer 3
    // outlines deliberately run past that, since the guide wants them cropped.
    shapes: [
      // Layer 2 - solid, small, almost fully visible, overlapping a field border.
      { tag: 'circle', attrs: { cx: 68, cy: 29, r: 10, fill: PALETTE.greenMid } },
      {
        tag: 'path',
        attrs: { d: 'M 20 73 a 12 12 0 0 1 24 0 Z', fill: PALETTE.gold },
      },
      // Layer 3 - thin outlines, large, cropped by the format.
      {
        tag: 'path',
        attrs: {
          d: 'M 50 6 C 50 6 16 46 16 66 a 34 34 0 0 0 68 0 C 84 46 50 6 50 6 Z',
          fill: 'none',
          stroke: PALETTE.pink,
          'stroke-width': 0.9,
          transform: 'translate(18 34) scale(0.62)',
        },
      },
      {
        tag: 'circle',
        attrs: {
          cx: 72,
          cy: 74,
          r: 22,
          fill: 'none',
          stroke: PALETTE.white,
          'stroke-width': 0.8,
        },
      },
      {
        tag: 'path',
        attrs: {
          d: 'M 50 0 C 52 30 70 48 100 50 C 70 52 52 70 50 100 C 48 70 30 52 0 50 C 30 48 48 30 50 0 Z',
          fill: 'none',
          stroke: PALETTE.lilac,
          'stroke-width': 1.1,
          transform: 'translate(26 11) scale(0.18)',
        },
      },
    ],
  },

  strings: {
    loadingPrep: 'Das Feld wird vorbereitet …',
    loadingStations: (n, total) => `Stationen werden geladen … ${n}/${total}`,
    loadFailed: 'Modelle konnten nicht geladen werden – siehe Konsole',

    startHeadline: ['WETTER–', 'STATIONEN'],
    startIntro:
      'Acht Messstationen des Deutschen Wetterdienstes, aus CAD-Daten in ein Feld ' +
      'gestellt. Geh spazieren, such sie alle und sieh dir an, was sie messen.',
    startButton: 'LOS GEHT’S',

    controlsTouch: [
      ['LINKS', 'Stick ziehen zum Gehen'],
      ['RECHTS', 'ziehen zum Umsehen'],
      ['LAUF', 'antippen zum Rennen'],
      ['TIPPEN', 'Station ansehen'],
      ['WETTER', 'oben rechts wechseln'],
    ],
    controlsDesktop: [
      ['W A S D', 'Gehen'],
      ['MAUS', 'Umsehen'],
      ['SHIFT', 'Rennen'],
      ['E', 'Station ansehen'],
      ['C', 'Wetter wechseln'],
      ['ESC', 'Maus freigeben'],
    ],

    foundLabel: 'STATIONEN GEFUNDEN',
    interact: 'ANSEHEN',
    distance: (m) => `${m} m entfernt`,
    here: 'Du bist da',

    hintTitle: (total) => `Finde alle ${total} Stationen`,
    hintSub: 'Geh nah heran, um sie einzutragen',
    foundToast: (name) => `Gefunden: ${name}`,
    remaining: (n) => (n === 1 ? 'noch eine Station' : `noch ${n} Stationen`),
    allFound: 'Alle Stationen gefunden!',
    completeTitle: 'Feldbegehung komplett',
    completeSub: 'Schöner Spaziergang.',

    panelSource: (s) => `Modell: ${s}`,
    panelNoDescription: 'Noch keine Beschreibung hinterlegt.',
    statHeight: 'Höhe',
    statFootprint: 'Grundfläche',
    panelClose: 'SCHLIESSEN',

    weatherTitle: 'WETTER',
    weatherAria: 'Wetter einstellen',
    weatherLabels: {
      clear: 'Klar',
      cloudy: 'Bewölkt',
      rain: 'Regen',
      storm: 'Gewitter',
      snow: 'Schnee',
      fog: 'Nebel',
    },
  },

  scene: {
    // Strong tones for the stations, so they read against the pastel ground.
    stationPalette: [
      PALETTE.orange,
      PALETTE.navy,
      PALETTE.green,
      PALETTE.gold,
      PALETTE.purple,
      PALETTE.cyan,
      PALETTE.red,
      PALETTE.teal,
    ],
    // 0 = full accent colour, 1 = fully neutral. Flat brand colour, lightly knocked back.
    stationTint: { target: '#C8CDD2', mix: 0.42 },
    stationMaterial: { metalness: 0.1, roughness: 0.85 },
    hemisphere: { sky: PALETTE.ice, ground: PALETTE.green },

    groundStyles: {
      grass: { base: PALETTE.greenMid, speck: PALETTE.green },
      wet: { base: '#4E9A78', speck: PALETTE.teal },
      snow: { base: PALETTE.lavender, speck: PALETTE.ice },
    },
    // Flat colour fields and circles strewn over the ground - the Layer 1/2 system
    // read from above.
    decals: {
      enabled: true,
      rectCount: 10,
      circleCount: 8,
      palette: [
        PALETTE.yellowPastel,
        PALETTE.ice,
        PALETTE.mint,
        PALETTE.lilac,
        PALETTE.pink,
        PALETTE.yellowPale,
        PALETTE.mintPale,
      ],
    },
    apron: { color: PALETTE.cream, scale: 1.45 },
    shadowOpacity: 0.16,

    weather: {
      clear: { skyTop: PALETTE.blue, skyHorizon: PALETTE.ice, sunColor: PALETTE.yellowPastel },
      cloudy: { skyTop: PALETTE.blueLight, skyHorizon: PALETTE.lavender, sunColor: PALETTE.white },
      rain: { skyTop: PALETTE.navy, skyHorizon: PALETTE.blueLight, sunColor: PALETTE.ice },
      storm: { skyTop: PALETTE.purple, skyHorizon: PALETTE.purpleLight, sunColor: PALETTE.lilac },
      snow: { skyTop: PALETTE.blueLight, skyHorizon: PALETTE.white, sunColor: PALETTE.white },
      fog: { skyTop: PALETTE.lilac, skyHorizon: PALETTE.lavender, sunColor: PALETTE.white },
    },
  },
};
