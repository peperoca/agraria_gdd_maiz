import type { CornStage } from '../types';

export type CropType = 'corn' | 'soybean' | 'wheat';

export interface CropConfig {
  label: string;
  baseTempF: number;
  upperCapF: number | null; // null = no cap
  maturityGdd: number;
  stages: CornStage[];
}

// ── Corn ──
const CORN_STAGES: CornStage[] = [
  { name: 'Emergence', shortName: 'VE', gdd: 120, description: 'Shoot emerges from soil; photosynthesis begins' },
  { name: 'First Leaf', shortName: 'V1', gdd: 164, description: 'First leaf collar visible; nodal roots emerging' },
  { name: 'Second Leaf', shortName: 'V2', gdd: 200, description: 'Plant relies on seed energy; seminal roots at max size' },
  { name: 'Third Leaf', shortName: 'V3', gdd: 282, description: 'Seed no longer contributing; plant dependent on photosynthesis' },
  { name: 'Fourth Leaf', shortName: 'V4', gdd: 360, description: 'Critical weed control period begins' },
  { name: 'Sixth Leaf', shortName: 'V6', gdd: 520, description: 'Growing point above soil; nodal root system dominant' },
  { name: 'Eighth Leaf', shortName: 'V8', gdd: 680, description: 'Rapid growth phase; ear shoots visible' },
  { name: 'Ninth Leaf', shortName: 'V9', gdd: 760, description: 'Kernel row number being fixed; brace roots developing' },
  { name: 'Twelfth Leaf', shortName: 'V12', gdd: 900, description: 'All leaves formed; ~10% total dry matter accumulated' },
  { name: 'Fifteenth Leaf', shortName: 'V15', gdd: 1060, description: 'Kernels per row being determined; ~2 weeks from silking' },
  { name: 'Seventeenth Leaf', shortName: 'V17', gdd: 1300, description: 'Increasing vulnerability to hail and moisture stress' },
  { name: 'Tassel', shortName: 'VT', gdd: 1350, description: 'Tassel emergence; 65% of N, 50% of P, 85% of K taken up' },
  { name: 'Silking', shortName: 'R1', gdd: 1500, description: 'Silks visible; critical yield-determining stage' },
  { name: 'Blister', shortName: 'R2', gdd: 1700, description: 'Kernels at 85% moisture; nutrient translocation begins' },
  { name: 'Milk', shortName: 'R3', gdd: 1875, description: 'Starch accumulation; kernels at 80% moisture' },
  { name: 'Dough', shortName: 'R4', gdd: 1950, description: '~50% maximum dry weight; kernels at 70% moisture' },
  { name: 'Dent', shortName: 'R5', gdd: 2300, description: '~90% dry matter accumulated; 55-60% moisture' },
  { name: 'Maturity', shortName: 'R6', gdd: 2700, description: 'Black layer formed; 30-35% moisture; final yield determined' },
];

// ── Soybean ──
const SOYBEAN_STAGES: CornStage[] = [
  { name: 'Emergence', shortName: 'VE', gdd: 90, description: 'Cotyledons above soil surface' },
  { name: 'Cotyledon', shortName: 'VC', gdd: 150, description: 'Unifoliolate leaves unrolled; cotyledons fully open' },
  { name: 'First Node', shortName: 'V1', gdd: 220, description: 'First trifoliolate leaf fully developed' },
  { name: 'Second Node', shortName: 'V2', gdd: 310, description: 'Second trifoliolate; nodulation active' },
  { name: 'Third Node', shortName: 'V3', gdd: 400, description: 'Rapid vegetative growth begins; N fixation increasing' },
  { name: 'Fifth Node', shortName: 'V5', gdd: 560, description: 'Canopy closing; peak N fixation approaching' },
  { name: 'Begin Bloom', shortName: 'R1', gdd: 750, description: 'First flower on any node; photoperiod sensitive' },
  { name: 'Full Bloom', shortName: 'R2', gdd: 870, description: 'Open flower at one of two uppermost nodes' },
  { name: 'Begin Pod', shortName: 'R3', gdd: 1000, description: 'Pod 5mm at one of four uppermost nodes' },
  { name: 'Full Pod', shortName: 'R4', gdd: 1150, description: 'Pod 2cm at one of four uppermost nodes' },
  { name: 'Begin Seed', shortName: 'R5', gdd: 1350, description: 'Seed 3mm in pod at upper nodes; rapid seed fill' },
  { name: 'Full Seed', shortName: 'R6', gdd: 1600, description: 'Green seed fills pod cavity at upper nodes' },
  { name: 'Begin Maturity', shortName: 'R7', gdd: 1900, description: 'One mature pod on main stem; leaves yellowing' },
  { name: 'Full Maturity', shortName: 'R8', gdd: 2200, description: '95% of pods mature; harvest ready at 13% moisture' },
];

// ── Wheat ──
const WHEAT_STAGES: CornStage[] = [
  { name: 'Emergence', shortName: 'E', gdd: 120, description: 'Coleoptile emerges from soil' },
  { name: 'Seedling', shortName: 'S', gdd: 200, description: 'First leaf unfolded; seminal roots active' },
  { name: 'Tillering', shortName: 'T', gdd: 400, description: 'Tillers forming from crown; root system expanding' },
  { name: 'Stem Extension', shortName: 'SE', gdd: 600, description: 'Internodes elongating; head moving upward' },
  { name: 'Booting', shortName: 'BT', gdd: 900, description: 'Flag leaf sheath swelling with head inside' },
  { name: 'Heading', shortName: 'HD', gdd: 1050, description: 'Head emerging from flag leaf sheath' },
  { name: 'Anthesis', shortName: 'AN', gdd: 1200, description: 'Flowering; pollination occurring' },
  { name: 'Milk', shortName: 'ML', gdd: 1400, description: 'Kernel contains milky liquid; grain filling' },
  { name: 'Dough', shortName: 'DG', gdd: 1600, description: 'Kernel contents doughy; losing green color' },
  { name: 'Maturity', shortName: 'MT', gdd: 1900, description: 'Kernel hard; physiological maturity reached' },
];

export const CROP_CONFIGS: Record<CropType, CropConfig> = {
  corn: {
    label: 'Corn',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2700,
    stages: CORN_STAGES,
  },
  soybean: {
    label: 'Soybean',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2200,
    stages: SOYBEAN_STAGES,
  },
  wheat: {
    label: 'Wheat',
    baseTempF: 32,
    upperCapF: null, // no upper cap for wheat
    maturityGdd: 1900,
    stages: WHEAT_STAGES,
  },
};

export function getCropConfig(cropType: CropType): CropConfig {
  return CROP_CONFIGS[cropType] ?? CROP_CONFIGS.corn;
}

/** Key stages for the summary dots display */
export function getKeyStages(cropType: CropType): string[] {
  switch (cropType) {
    case 'corn':
      return ['VE', 'V6', 'V12', 'VT', 'R1', 'R4', 'R6'];
    case 'soybean':
      return ['VE', 'V3', 'R1', 'R3', 'R5', 'R7', 'R8'];
    case 'wheat':
      return ['E', 'T', 'SE', 'HD', 'AN', 'DG', 'MT'];
  }
}
