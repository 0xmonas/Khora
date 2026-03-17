/**
 * Trait pools for BOOA character generation.
 * Theme: PUNK — set in the Khôra universe (cyberpunk sci-fi agent world).
 * These are inspiration/range indicators — AI should remix and invent, not copy.
 * Each generation randomly samples a subset to include in the prompt.
 */

export const EYEWEAR_POOL = [
  // Cyberpunk / tech
  'cracked HUD visor with flickering data', 'neural interface monocle (wired in)', 'thermal scan goggles (red-tinted)',
  'holographic targeting reticle over one eye', 'welding goggles pushed up on forehead', 'prosthetic eye with zoom lens',
  'anti-surveillance mirror shades', 'mechanic loupe magnifier', 'wired-in optic implant (glowing iris)',
  'cracked aviator sunglasses (one lens missing)', 'industrial safety goggles (scratched)', 'night-vision scope monocle',
  // Punk / street
  'spray-painted gas mask goggles', 'DIY soldering goggles', 'taped-together broken sunglasses',
  'wraparound chrome visor', 'spiked leather eye patch', 'round tinted anarchist glasses',
  'duct-taped ski goggles', 'oversized bug-eye shades (stolen)', 'scratched riot shield visor (lifted)',
  'hand-painted frames (mismatched colors)', 'chain-linked monocle', 'reflective rave goggles (neon glow)',
  // Sleek / agent
  'thin titanium frames (clean, minimal)', 'matte black ops sunglasses', 'slim rectangular data glasses',
  'tinted combat visor', 'elegant gold wire-frame spectacles', 'frosted translucent frames',
  'half-rim reading glasses (worn low)', 'hexagonal brushed-steel frames',
  // Eclectic
  'heart-shaped rose glasses', 'star-shaped party shades', 'kaleidoscope prism lenses',
  'cracked clock-face monocle', 'hand-forged copper circles', 'candy-striped novelty frames',
  'lightning bolt shaped frames', 'oversized square fashion frames', 'medical eye shield (post-surgery)',
  // None (~20%)
  'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None',
  'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None',
] as const;

export const HEADWEAR_POOL = [
  // Cyberpunk / tech
  'neural interface headband (pulsing)', 'antenna array helmet', 'satellite receiver headpiece',
  'data-jack crown (wires trailing)', 'cracked mech pilot helmet', 'holographic display visor (raised)',
  'server-fan cooling headpiece', 'signal-boosting mohawk crest (metal)', 'drone pilot neural cap',
  'circuit-etched skullcap', 'broken VR helmet repurposed as hat', 'LED matrix scrolling-text band',
  // Punk / street
  'spray-painted motorcycle helmet', 'spiked leather headband', 'DIY welded metal crown',
  'torn bandana (oil-stained)', 'mohawk-shaped helmet crest', 'chain-wrapped beanie',
  'graffiti-tagged snapback', 'riveted leather aviator cap', 'anarchist beret (patches sewn on)',
  'gas mask strapped to forehead', 'barbed wire crown', 'hand-stitched hood (asymmetric)',
  // Agent / functional
  'tactical beret', 'comms headset (one ear)', 'officer peaked cap (worn crooked)',
  'lab safety helmet', 'hardhat with custom decals', 'pilot helmet (retro)',
  'medic headlamp band', 'detective fedora (beat up)', 'engineer flat cap (grease-stained)',
  // Eclectic / wild
  'flower crown (wildflowers, wilting)', 'paper origami boat hat', 'traffic cone (worn confidently)',
  'backwards trucker hat', 'demon horn headband', 'cat-ear hood (hand-sewn)',
  'mushroom cap hat', 'oversized bow headband', 'knitted rainbow beanie',
  'stacked books balanced on head', 'candy pink beret', 'neon green snapback',
  'bunny ear headband', 'cactus novelty hat', 'propeller beanie (ironic)',
  // None (~10%)
  'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None',
] as const;

export const OUTFIT_POOL = [
  // Cyberpunk / techwear
  'techwear tactical vest with cable ports', 'LED-piped jacket (color-cycling)', 'armored trench coat (matte black)',
  'mechanic jumpsuit with tool loops', 'data-runner lightweight harness over tee', 'power-cell backpack vest',
  'wired-in flight suit (orange, patched)', 'chrome-plated shoulder armor over hoodie', 'carbon fiber chest rig',
  'holographic camo poncho', 'exosuit frame (stripped down, worn as jacket)', 'reactive fiber jacket (color-shifting)',
  // Punk / DIY / street
  'leather jacket covered in hand-painted patches', 'ripped band tee safety-pinned back together',
  'spiked denim vest over bare chest', 'spray-painted hazmat suit', 'duct-tape repaired puffer jacket',
  'chain-wrapped hoodie', 'hand-sewn patchwork coat (mismatched fabrics)', 'cut-off military jacket (sleeves torn)',
  'studded leather corset over flannel', 'graffiti-tagged lab coat', 'inverted fur coat (inside-out)',
  'bondage strap harness over plain tee', 'DIY screen-printed crop top',
  // Agent / professional (Khôra style)
  'sleek black turtleneck (clean-cut)', 'tailored blazer with hidden weapon holster',
  'white lab coat (chemical stains)', 'tactical polo and cargo pants', 'crisp dress shirt (sleeves rolled, tie loosened)',
  'medic vest (red cross, worn)', 'engineer coveralls (name-patched)', 'diplomat suit (rumpled, been in a fight)',
  'courier windbreaker (reflective strips)', 'bounty hunter duster coat',
  // Cultural / world-building
  'nomad robes (layered, desert-worn)', 'market trader apron over colorful tunic',
  'street food vendor jacket (grease-stained, cheerful)', 'temple guardian ceremonial wrap',
  'underground fight club tank top', 'jazz club velvet blazer (burgundy)',
  'racing suit with custom decals', 'boxing robe (gold satin)', 'fisherman waterproof coat',
  // Eclectic variety
  'tie-dye hoodie', 'Hawaiian shirt (tropical print)', 'bathrobe worn outside (plush pink)',
  'oversized hoodie (three sizes too big)', 'sequined disco jumpsuit (gold)', 'bomber jacket (olive/orange)',
  'varsity letterman jacket', 'tracksuit (retro color block)', 'suspenders over graphic tee',
  'crop hoodie (neon pink)', 'neon windbreaker (gradient)', 'denim jacket covered in enamel pins',
  'puffer jacket (bubblegum pink)', 'leather biker vest with chains', 'fishing vest with too many pockets',
  'knitted grandma cardigan (pastel)', 'mechanic jumpsuit (navy, oil-stained)', 'ballet tutu over combat boots outfit',
] as const;

export const CREATURE_POOL = [
  // Humanoid agents — people of Khôra
  'scarred street medic', 'back-alley cybersurgeon', 'rogue data courier',
  'retired combat android', 'neon-district bartender', 'black market arms dealer',
  'underground radio host', 'disgraced corporate exec gone punk', 'graffiti alchemist',
  'masked vigilante hacker', 'off-grid survivalist', 'junkyard mech engineer',
  'smuggler pilot', 'street-level prophet', 'burned-out detective',
  'rooftop sniper turned florist', 'neural implant surgeon (unlicensed)', 'parkour messenger',
  'deep-web archivist', 'nightclub bouncer with a philosophy degree',

  // Animal/hybrid agents — evolved or augmented beings
  'augmented wolf bounty hunter', 'cybernetic fox scout', 'armored pangolin tank operator',
  'electric eel power engineer', 'mantis shrimp fighter (fastest punch in Khôra)',
  'one-eyed raven intelligence agent', 'chameleon infiltration specialist',
  'octopus multitask coordinator', 'bull minotaur pit boss', 'raccoon scrap mechanic',
  'scarred tiger enforcer', 'poison dart frog chemist', 'hammerhead shark dock boss',
  'firefly lantern keeper', 'moth signal interceptor', 'honey badger demolitions expert',
  'axolotl regeneration medic', 'flamingo cabaret performer', 'pufferfish defense analyst',
  'spider architect (builds structures)', 'penguin cold-storage logistics', 'parrot comms officer',

  // Demon/undead/mythic — Khôra's darker corners
  'skull-faced bouncer', 'ghost in the machine (literal)', 'lich king coder (ancient)',
  'vampire nightclub owner', 'skeleton mechanic', 'banshee emergency siren',
  'devil in a three-piece suit', 'grim reaper intern (new on the job)', 'oni gate guardian',
  'kitsune con artist', 'djinn wish broker', 'phoenix crash recovery specialist',
  'cyclops watchmaker', 'goblin black market dealer', 'troll bridge toll collector',
  'fairy with torn wings (punk)', 'demon horn DJ', 'haunted scarecrow border guard',

  // Robot/android/AI — synthetic Khôra residents
  'CRT monitor-headed news anchor', 'vending machine bot (sentient, grumpy)', 'broken android leaking coolant',
  'traffic light bureaucrat', 'boombox-shouldered street DJ bot', 'calculator-faced accountant',
  'satellite dish oracle', 'rusty maintenance drone (self-aware)', 'holographic glitch being',
  'printer-jam technician bot', 'self-aware security camera', 'decommissioned war unit turned poet',
  'radio tower signal broadcaster', 'cash register merchant bot', 'elevator AI (trapped, talkative)',

  // Unique / hard to classify
  'sentient graffiti (peeled off the wall)', 'living wanted poster', 'animate neon sign',
  'conscious vending machine', 'walking jukebox', 'sapient potted plant (aggressive)',
  'talking manhole cover', 'living tattoo (jumped off someone)', 'sentient smoke cloud',
  'ambulatory fire hydrant', 'conscious traffic cone', 'self-aware shopping cart',
] as const;

/**
 * Randomly sample N items from an array (Fisher-Yates partial shuffle).
 */
export function samplePool<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const result: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}
