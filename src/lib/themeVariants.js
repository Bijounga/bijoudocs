// Background variations for the themes that have a wallpaper. Picking a
// theme in the Theme tab shows these as thumbnails underneath it; the
// choice is remembered per theme (settings.themeVariants[themeId]).
// App.jsx exposes the chosen one to styles.css as --theme-wallpaper /
// --theme-wallpaper-pos / --theme-wallpaper-render.
//
// Sources: Minecraft — HUD-free screenshots from the Minecraft wiki
// (Fandom). Windows-era photo variants — 2560px renders of Wikimedia
// Commons photos (credits in src/assets/bg/CREDITS.txt); Bliss and the
// Windows 7 / Vista default wallpapers are Microsoft's own. Terraria —
// the game's own biome background layers (terraria.wiki.gg) and other
// native pixel art, scaled up with nearest-neighbour so they stay crisp.
import trPineForest from '../assets/bg/tr-pine-forest.webp'
import trMountainLake from '../assets/bg/tr-mountain-lake.webp'
import trSkyCliffs from '../assets/bg/tr-sky-cliffs.webp'
import trHallow from '../assets/bg/tr-hallow.webp'
import trMushroomNight from '../assets/bg/tr-mushroom-night.webp'
import trGlowingMushrooms from '../assets/bg/tr-glowing-mushrooms.webp'
import trJungle from '../assets/bg/tr-jungle.webp'
import trOcean from '../assets/bg/tr-ocean.webp'
import trSnow from '../assets/bg/tr-snow.webp'
import trCavern from '../assets/bg/tr-cavern.webp'
import trJungleCavern from '../assets/bg/tr-jungle-cavern.webp'
import dosClouds from '../assets/dos-bg.jpg'
import dosTeal from '../assets/bg/dos-teal.png'
import aeroSky from '../assets/aero-sky.jpg'
import aeroWindows7 from '../assets/bg/aero-windows-7.webp'
import aeroVista from '../assets/bg/aero-vista.webp'
import aeroWaterfall from '../assets/bg/aero-waterfall.webp'
import aeroLavender from '../assets/bg/aero-lavender.webp'
import aeroGlacier from '../assets/bg/aero-glacier.webp'
import aeroPalm from '../assets/bg/aero-palm.webp'
import aeroHills from '../assets/bg/aero-hills.webp'
import aeroNight from '../assets/aero-night.jpg'
import aerodarkAurora from '../assets/bg/aerodark-aurora.webp'
import aerodarkVistaAurora from '../assets/bg/aerodark-vista-aurora.webp'
import aerodarkVistaRibbons from '../assets/bg/aerodark-vista-ribbons.webp'
import aerodarkDusk from '../assets/bg/aerodark-dusk.webp'
import aerodarkLeaves from '../assets/bg/aerodark-leaves.webp'
import vaporClouds from '../assets/vapor-clouds.png'
import vaporSunsetGrid from '../assets/bg/vapor-sunset-grid.webp'
import vaporPalmSunset from '../assets/bg/vapor-palm-sunset.webp'
import vaporNeonCity from '../assets/bg/vapor-neon-city.webp'
import vaporPastelDream from '../assets/bg/vapor-pastel-dream.webp'
import vaporPinkPalms from '../assets/bg/vapor-pink-palms.webp'
import vaporPalmSilhouettes from '../assets/bg/vapor-palm-silhouettes.webp'
import y2kHolo from '../assets/bg/y2k-holo.webp'
import y2kCarbon from '../assets/bg/y2k-carbon.webp'
import y2kDiamondPlate from '../assets/bg/y2k-diamond-plate.png'
import gunmetalDiamondPlate from '../assets/bg/gunmetal-diamond-plate.png'
import doodleBlue from '../assets/bg/doodle-blue.png'
import doodlePurple from '../assets/bg/doodle-purple.png'
import doodlePink from '../assets/bg/doodle-pink.png'
import doodleRed from '../assets/bg/doodle-red.png'
import doodleOrange from '../assets/bg/doodle-orange.png'
import doodleGreen from '../assets/bg/doodle-green.png'
import doodleTeal from '../assets/bg/doodle-teal.png'
import doodleNight from '../assets/bg/doodle-night.png'
import doodleNotebook from '../assets/bg/doodle-notebook.png'
import doodleChalkboard from '../assets/bg/doodle-chalkboard.png'
import doodleKraft from '../assets/bg/doodle-kraft.png'
import paperLined from '../assets/bg/paper-lined.png'
import paperGraph from '../assets/bg/paper-graph.png'
import paperDots from '../assets/bg/paper-dots.png'
import paperLegal from '../assets/bg/paper-legal.png'

// Pure-CSS backgrounds (no image): the Y2K themes' own metal and the amber
// LCD back wall from Bijou Footage.
const BRUSHED_CHROME = 'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.12) 0 1px, rgba(0, 0, 0, 0.04) 1px 2px), linear-gradient(180deg, #c9ced4 0%, #b3b9c0 100%)'
const BRUSHED_GUNMETAL = 'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04) 0 1px, rgba(0, 0, 0, 0.08) 1px 2px), linear-gradient(180deg, #2a2e34 0%, #16191d 100%)'
const AMBER_LCD = 'radial-gradient(ellipse 40% 120% at 0% 50%, rgba(255, 150, 0, 0.12), rgba(255, 150, 0, 0) 70%), radial-gradient(ellipse 40% 120% at 100% 50%, rgba(255, 150, 0, 0.12), rgba(255, 150, 0, 0) 70%), radial-gradient(ellipse 100% 90% at 50% 45%, #2e1a02 0%, #170c00 70%, #0b0600 100%)'
import xpBliss from '../assets/bg/xp-bliss.webp'
import xpCraterLake from '../assets/bg/xp-crater-lake.webp'
import xpCreek from '../assets/bg/xp-creek.webp'
import xpAlpineMeadow from '../assets/bg/xp-alpine-meadow.webp'
import xpCoastalGrass from '../assets/bg/xp-coastal-grass.webp'
import xpMountainLake from '../assets/bg/xp-mountain-lake.webp'
import xpOpenRoad from '../assets/bg/xp-open-road.webp'
import mcMeadow from '../assets/bg/mc-meadow.webp'
import mcCherryGrove from '../assets/bg/mc-cherry-grove.webp'
import mcVillageLibrary from '../assets/bg/mc-village-library.webp'
import mcFlowerGarden from '../assets/bg/mc-flower-garden.webp'
import mcVillageValley from '../assets/bg/mc-village-valley.webp'
import mcJungleCoast from '../assets/bg/mc-jungle-coast.webp'
import mcJungleMeadow from '../assets/bg/mc-jungle-meadow.webp'
import mcMountainValley from '../assets/bg/mc-mountain-valley.webp'
import mcTaigaPeaks from '../assets/bg/mc-taiga-peaks.webp'
import mcSwampSpires from '../assets/bg/mc-swamp-spires.webp'
import mcWaterfalls from '../assets/bg/mc-waterfalls.webp'
import mcTaigaRiver from '../assets/bg/mc-taiga-river.webp'
import mcMountainSunset from '../assets/bg/mc-mountain-sunset.webp'
import mcJungleSunset from '../assets/bg/mc-jungle-sunset.webp'
import mcLushGrotto from '../assets/bg/mc-lush-grotto.webp'
import mcLushMountain from '../assets/bg/mc-lush-mountain.webp'
import mcDripstoneCave from '../assets/bg/mc-dripstone-cave.webp'
import mcDirt from '../assets/bg/mc-dirt.webp'
import mcDirtVignette from '../assets/bg/mc-dirt-vignette.webp'

// pixel: scale with nearest-neighbour (pixel art) instead of smoothing.
// Terraria scenes don't need it: they're pre-scaled to an exact 3x of the
// game's native layers (scripts in the session scratchpad: rebuild-hq.cjs),
// so the browser only ever shrinks them slightly.
// overlay: false turns off a theme's own tint layer (Aero's green/blue
// wash, tuned for its default sky photo).
export const THEME_VARIANTS = {
  dos: [
    { id: 'clouds', label: 'Clouds', url: dosClouds },
    { id: 'bliss', label: 'Bliss (Windows XP)', url: xpBliss },
    { id: 'teal', label: 'Windows 95 teal', url: dosTeal }
  ],
  xp: [
    { id: 'bliss', label: 'Bliss', url: xpBliss },
    { id: 'crater-lake', label: 'Crater lake', url: xpCraterLake },
    { id: 'creek', label: 'Forest stream', url: xpCreek },
    { id: 'alpine-meadow', label: 'Alpine meadow', url: xpAlpineMeadow },
    { id: 'coastal-grass', label: 'Lighthouse coast', url: xpCoastalGrass },
    { id: 'mountain-lake', label: 'Mountain lake', url: xpMountainLake },
    { id: 'open-road', label: 'Mountain road', url: xpOpenRoad }
  ],
  aero: [
    { id: 'sky', label: 'Aero sky', url: aeroSky },
    { id: 'windows-7', label: 'Windows 7', url: aeroWindows7, overlay: false },
    { id: 'vista', label: 'Windows Vista', url: aeroVista, overlay: false },
    { id: 'waterfall', label: 'Waterfall', url: aeroWaterfall, overlay: false },
    { id: 'lavender', label: 'Lavender', url: aeroLavender, overlay: false },
    { id: 'glacier', label: 'Glacier', url: aeroGlacier, overlay: false },
    { id: 'palm', label: 'Palm', url: aeroPalm, overlay: false },
    { id: 'hills', label: 'Sea hills', url: aeroHills, overlay: false }
  ],
  aeroDark: [
    { id: 'night', label: 'Night sky', url: aeroNight },
    { id: 'vista-aurora', label: 'Vista aurora (dark)', url: aerodarkVistaAurora },
    { id: 'vista-ribbons', label: 'Vista ribbons (dark)', url: aerodarkVistaRibbons },
    { id: 'aurora', label: 'Aurora', url: aerodarkAurora },
    { id: 'dusk', label: 'Dusk city', url: aerodarkDusk },
    { id: 'leaves', label: 'Leaves', url: aerodarkLeaves }
  ],
  // overlay: false hides Vaporwave's own neon grid + purple fade, which only
  // suit its pixel-cloud sky (the scenes bring their own).
  vaporwave: [
    { id: 'clouds', label: 'Pixel clouds', url: vaporClouds, pixel: true },
    { id: 'sunset-grid', label: 'Sunset grid', url: vaporSunsetGrid, overlay: false },
    { id: 'palm-sunset', label: 'Palm sunset', url: vaporPalmSunset, overlay: false },
    { id: 'neon-city', label: 'Neon city', url: vaporNeonCity, overlay: false },
    { id: 'pastel-dream', label: 'Pastel dream', url: vaporPastelDream, overlay: false },
    { id: 'pink-palms', label: 'Pink palms', url: vaporPinkPalms, overlay: false },
    { id: 'palm-silhouettes', label: 'Palm silhouettes', url: vaporPalmSilhouettes, overlay: false }
  ],
  y2kChrome: [
    { id: 'brushed', label: 'Brushed aluminium', css: BRUSHED_CHROME },
    { id: 'lcd', label: 'Amber LCD', css: AMBER_LCD },
    { id: 'holo', label: 'Holographic', url: y2kHolo },
    { id: 'diamond-plate', label: 'Diamond plate', url: y2kDiamondPlate, tile: 120 },
    { id: 'carbon', label: 'Carbon fibre', url: y2kCarbon }
  ],
  y2kGunmetal: [
    { id: 'gunmetal', label: 'Gunmetal', css: BRUSHED_GUNMETAL },
    { id: 'lcd', label: 'Amber LCD', css: AMBER_LCD },
    { id: 'carbon', label: 'Carbon fibre', url: y2kCarbon },
    { id: 'diamond-plate', label: 'Dark diamond plate', url: gunmetalDiamondPlate, tile: 120 }
  ],
  // The skribbl.io-style doodle tile, repeated at its native 400px, in colours,
  // then the same doodles inked onto other paper stocks, then plain papers.
  doodleClub: [
    { id: 'blue', label: 'Blue', url: doodleBlue, tile: 400 },
    { id: 'purple', label: 'Purple', url: doodlePurple, tile: 400 },
    { id: 'pink', label: 'Pink', url: doodlePink, tile: 400 },
    { id: 'red', label: 'Red', url: doodleRed, tile: 400 },
    { id: 'orange', label: 'Orange', url: doodleOrange, tile: 400 },
    { id: 'green', label: 'Green', url: doodleGreen, tile: 400 },
    { id: 'teal', label: 'Teal', url: doodleTeal, tile: 400 },
    { id: 'night', label: 'Night', url: doodleNight, tile: 400 },
    { id: 'notebook', label: 'Notebook doodles', url: doodleNotebook, tile: 400 },
    { id: 'chalkboard', label: 'Chalkboard', url: doodleChalkboard, tile: 400 },
    { id: 'kraft', label: 'Kraft paper', url: doodleKraft, tile: 400 },
    { id: 'lined', label: 'Lined paper', url: paperLined, tile: 384 },
    { id: 'graph', label: 'Graph paper', url: paperGraph, tile: 400 },
    { id: 'dots', label: 'Dot grid', url: paperDots, tile: 400 },
    { id: 'legal', label: 'Legal pad', url: paperLegal, tile: 384 }
  ],
  terraria: [
    { id: 'pine-forest', label: 'Pine forest', url: trPineForest, position: 'center bottom' },
    { id: 'mountain-lake', label: 'Mountain lake', url: trMountainLake },
    { id: 'sky-cliffs', label: 'Sky cliffs', url: trSkyCliffs },
    { id: 'hallow', label: 'The Hallow', url: trHallow },
    { id: 'jungle', label: 'Jungle', url: trJungle },
    { id: 'ocean', label: 'Ocean', url: trOcean },
    { id: 'snow', label: 'Snow', url: trSnow },
    { id: 'mushroom-night', label: 'Mushroom night', url: trMushroomNight },
    { id: 'glowing-mushrooms', label: 'Glowing mushrooms', url: trGlowingMushrooms },
    { id: 'cavern', label: 'Cavern', url: trCavern },
    { id: 'jungle-cavern', label: 'Jungle cavern', url: trJungleCavern }
  ],
  minecraft: [
    { id: 'meadow', label: 'Meadow', url: mcMeadow },
    { id: 'cherry-grove', label: 'Cherry grove', url: mcCherryGrove },
    { id: 'jungle-meadow', label: 'Jungle meadow', url: mcJungleMeadow },
    { id: 'jungle-coast', label: 'Jungle coast', url: mcJungleCoast },
    { id: 'mountain-valley', label: 'Mountain valley', url: mcMountainValley },
    { id: 'village-valley', label: 'Village valley', url: mcVillageValley },
    { id: 'flower-garden', label: 'Flower garden', url: mcFlowerGarden },
    { id: 'village-library', label: 'Village library', url: mcVillageLibrary },
    { id: 'taiga-peaks', label: 'Taiga peaks', url: mcTaigaPeaks },
    { id: 'swamp-spires', label: 'Swamp spires', url: mcSwampSpires },
    { id: 'waterfalls', label: 'Waterfalls', url: mcWaterfalls },
    { id: 'taiga-river', label: 'Taiga river', url: mcTaigaRiver },
    { id: 'mountain-sunset', label: 'Mountain sunset', url: mcMountainSunset },
    { id: 'jungle-sunset', label: 'Jungle sunset', url: mcJungleSunset },
    { id: 'lush-grotto', label: 'Lush grotto', url: mcLushGrotto },
    { id: 'lush-mountain', label: 'Lush cave mountain', url: mcLushMountain },
    { id: 'dripstone-cave', label: 'Dripstone cave', url: mcDripstoneCave },
    { id: 'dirt', label: 'Dirt', url: mcDirt },
    { id: 'dirt-vignette', label: 'Dirt (dark edges)', url: mcDirtVignette }
  ]
}

// The variant to show for a theme: the saved choice, else the first (also
// covers a saved choice that no longer exists).
export function activeVariant(theme, chosen) {
  const list = THEME_VARIANTS[theme]
  if (!list) return null
  return list.find((v) => v.id === (chosen && chosen[theme])) || list[0]
}
