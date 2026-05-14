import type { CornStage } from '../types';

// ── Base crop species ──
export type BaseCrop = 'corn' | 'soybean' | 'wheat';

// ── All valid crop type identifiers (compound: crop-maturity) ──
export type CropType =
  | 'corn' | 'corn-short' | 'corn-intermediate' | 'corn-long'
  | 'soybean' | 'soybean-short' | 'soybean-intermediate' | 'soybean-long'
  | 'wheat' | 'wheat-short' | 'wheat-intermediate' | 'wheat-long';

export interface CropConfig {
  label: string;
  baseCrop: BaseCrop;
  maturityLabel: string;
  baseTempF: number;
  upperCapF: number | null; // null = no cap
  maturityGdd: number;
  stages: CornStage[];
  /** Wheat only: vernalization target in cold-hours (Vd) */
  vernalizationTarget?: number;
  /** Soybean only: critical daylength (hours) for flowering induction */
  criticalPhotoperiod?: number;
  /** Soybean only: photothermal units target for maturity */
  maturityPtu?: number;
}

// ── Helper: scale stage GDD values proportionally ──
function scaleStages(stages: CornStage[], factor: number): CornStage[] {
  return stages.map((s) => ({
    ...s,
    gdd: Math.round(s.gdd * factor / 10) * 10, // round to nearest 10
  }));
}

// ═══════════════════════════════════════════════════════════════
//  CORN STAGES (baseline = intermediate at 2500 GDD)
// ═══════════════════════════════════════════════════════════════
const CORN_STAGES_INTERMEDIATE: CornStage[] = [
  { name: 'Emergence', shortName: 'VE', gdd: 110, description: 'Shoot emerges from soil; photosynthesis begins' },
  { name: 'First Leaf', shortName: 'V1', gdd: 150, description: 'First leaf collar visible; nodal roots emerging' },
  { name: 'Second Leaf', shortName: 'V2', gdd: 185, description: 'Plant relies on seed energy; seminal roots at max size' },
  { name: 'Third Leaf', shortName: 'V3', gdd: 260, description: 'Seed no longer contributing; plant dependent on photosynthesis' },
  { name: 'Fourth Leaf', shortName: 'V4', gdd: 335, description: 'Critical weed control period begins' },
  { name: 'Sixth Leaf', shortName: 'V6', gdd: 480, description: 'Growing point above soil; nodal root system dominant' },
  { name: 'Eighth Leaf', shortName: 'V8', gdd: 630, description: 'Rapid growth phase; ear shoots visible' },
  { name: 'Ninth Leaf', shortName: 'V9', gdd: 705, description: 'Kernel row number being fixed; brace roots developing' },
  { name: 'Twelfth Leaf', shortName: 'V12', gdd: 830, description: 'All leaves formed; ~10% total dry matter accumulated' },
  { name: 'Fifteenth Leaf', shortName: 'V15', gdd: 980, description: 'Kernels per row being determined; ~2 weeks from silking' },
  { name: 'Seventeenth Leaf', shortName: 'V17', gdd: 1200, description: 'Increasing vulnerability to hail and moisture stress' },
  { name: 'Tassel', shortName: 'VT', gdd: 1250, description: 'Tassel emergence; 65% of N, 50% of P, 85% of K taken up' },
  { name: 'Silking', shortName: 'R1', gdd: 1390, description: 'Silks visible; critical yield-determining stage' },
  { name: 'Blister', shortName: 'R2', gdd: 1570, description: 'Kernels at 85% moisture; nutrient translocation begins' },
  { name: 'Milk', shortName: 'R3', gdd: 1740, description: 'Starch accumulation; kernels at 80% moisture' },
  { name: 'Dough', shortName: 'R4', gdd: 1810, description: '~50% maximum dry weight; kernels at 70% moisture' },
  { name: 'Dent', shortName: 'R5', gdd: 2130, description: '~90% dry matter accumulated; 55-60% moisture' },
  { name: 'Maturity', shortName: 'R6', gdd: 2500, description: 'Black layer formed; 30-35% moisture; final yield determined' },
];

const CORN_STAGES_SHORT = scaleStages(CORN_STAGES_INTERMEDIATE, 2200 / 2500);
const CORN_STAGES_LONG = scaleStages(CORN_STAGES_INTERMEDIATE, 2800 / 2500);

// ═══════════════════════════════════════════════════════════════
//  SOYBEAN STAGES (baseline = intermediate MG V-VI at 2400 GDD)
// ═══════════════════════════════════════════════════════════════
const SOYBEAN_STAGES_INTERMEDIATE: CornStage[] = [
  { name: 'Emergence', shortName: 'VE', gdd: 100, description: 'Cotyledons above soil surface' },
  { name: 'Cotyledon', shortName: 'VC', gdd: 165, description: 'Unifoliolate leaves unrolled; cotyledons fully open' },
  { name: 'First Node', shortName: 'V1', gdd: 240, description: 'First trifoliolate leaf fully developed' },
  { name: 'Second Node', shortName: 'V2', gdd: 340, description: 'Second trifoliolate; nodulation active' },
  { name: 'Third Node', shortName: 'V3', gdd: 435, description: 'Rapid vegetative growth begins; N fixation increasing' },
  { name: 'Fifth Node', shortName: 'V5', gdd: 610, description: 'Canopy closing; peak N fixation approaching' },
  { name: 'Begin Bloom', shortName: 'R1', gdd: 820, description: 'First flower on any node; photoperiod sensitive' },
  { name: 'Full Bloom', shortName: 'R2', gdd: 950, description: 'Open flower at one of two uppermost nodes' },
  { name: 'Begin Pod', shortName: 'R3', gdd: 1090, description: 'Pod 5mm at one of four uppermost nodes' },
  { name: 'Full Pod', shortName: 'R4', gdd: 1260, description: 'Pod 2cm at one of four uppermost nodes' },
  { name: 'Begin Seed', shortName: 'R5', gdd: 1470, description: 'Seed 3mm in pod at upper nodes; rapid seed fill' },
  { name: 'Full Seed', shortName: 'R6', gdd: 1745, description: 'Green seed fills pod cavity at upper nodes' },
  { name: 'Begin Maturity', shortName: 'R7', gdd: 2070, description: 'One mature pod on main stem; leaves yellowing' },
  { name: 'Full Maturity', shortName: 'R8', gdd: 2400, description: '95% of pods mature; harvest ready at 13% moisture' },
];

const SOYBEAN_STAGES_SHORT = scaleStages(SOYBEAN_STAGES_INTERMEDIATE, 2000 / 2400);
const SOYBEAN_STAGES_LONG = scaleStages(SOYBEAN_STAGES_INTERMEDIATE, 2800 / 2400);

// ═══════════════════════════════════════════════════════════════
//  WHEAT STAGES (baseline = intermediate at 1750 GDD)
// ═══════════════════════════════════════════════════════════════
const WHEAT_STAGES_INTERMEDIATE: CornStage[] = [
  { name: 'Emergence', shortName: 'E', gdd: 110, description: 'Coleoptile emerges from soil' },
  { name: 'Seedling', shortName: 'S', gdd: 185, description: 'First leaf unfolded; seminal roots active' },
  { name: 'Tillering', shortName: 'T', gdd: 370, description: 'Tillers forming from crown; root system expanding' },
  { name: 'Stem Extension', shortName: 'SE', gdd: 550, description: 'Internodes elongating; head moving upward' },
  { name: 'Booting', shortName: 'BT', gdd: 830, description: 'Flag leaf sheath swelling with head inside' },
  { name: 'Heading', shortName: 'HD', gdd: 970, description: 'Head emerging from flag leaf sheath' },
  { name: 'Anthesis', shortName: 'AN', gdd: 1110, description: 'Flowering; pollination occurring' },
  { name: 'Milk', shortName: 'ML', gdd: 1290, description: 'Kernel contains milky liquid; grain filling' },
  { name: 'Dough', shortName: 'DG', gdd: 1480, description: 'Kernel contents doughy; losing green color' },
  { name: 'Maturity', shortName: 'MT', gdd: 1750, description: 'Kernel hard; physiological maturity reached' },
];

const WHEAT_STAGES_SHORT = scaleStages(WHEAT_STAGES_INTERMEDIATE, 1500 / 1750);
const WHEAT_STAGES_LONG = scaleStages(WHEAT_STAGES_INTERMEDIATE, 2100 / 1750);

// ═══════════════════════════════════════════════════════════════
//  CROP CONFIGS (12 entries + 3 bare aliases)
// ═══════════════════════════════════════════════════════════════
export const CROP_CONFIGS: Record<CropType, CropConfig> = {
  // ── Corn ──
  'corn-short': {
    label: 'Corn — Short',
    baseCrop: 'corn',
    maturityLabel: 'Short (~2200 GDD)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2200,
    stages: CORN_STAGES_SHORT,
  },
  'corn-intermediate': {
    label: 'Corn — Intermediate',
    baseCrop: 'corn',
    maturityLabel: 'Intermediate (~2500 GDD)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2500,
    stages: CORN_STAGES_INTERMEDIATE,
  },
  'corn-long': {
    label: 'Corn — Long',
    baseCrop: 'corn',
    maturityLabel: 'Long (~2800 GDD)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2800,
    stages: CORN_STAGES_LONG,
  },
  // bare alias → intermediate
  corn: {
    label: 'Corn — Intermediate',
    baseCrop: 'corn',
    maturityLabel: 'Intermediate (~2500 GDD)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2500,
    stages: CORN_STAGES_INTERMEDIATE,
  },

  // ── Soybean ──
  'soybean-short': {
    label: 'Soybean — Short (MG III-IV)',
    baseCrop: 'soybean',
    maturityLabel: 'Short (MG III-IV)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2000,
    stages: SOYBEAN_STAGES_SHORT,
    criticalPhotoperiod: 13.5,
    maturityPtu: 26000,
  },
  'soybean-intermediate': {
    label: 'Soybean — Intermediate (MG V-VI)',
    baseCrop: 'soybean',
    maturityLabel: 'Intermediate (MG V-VI)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2400,
    stages: SOYBEAN_STAGES_INTERMEDIATE,
    criticalPhotoperiod: 13.0,
    maturityPtu: 31000,
  },
  'soybean-long': {
    label: 'Soybean — Long (MG VII-VIII)',
    baseCrop: 'soybean',
    maturityLabel: 'Long (MG VII-VIII)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2800,
    stages: SOYBEAN_STAGES_LONG,
    criticalPhotoperiod: 12.5,
    maturityPtu: 36000,
  },
  // bare alias → intermediate
  soybean: {
    label: 'Soybean — Intermediate (MG V-VI)',
    baseCrop: 'soybean',
    maturityLabel: 'Intermediate (MG V-VI)',
    baseTempF: 50,
    upperCapF: 86,
    maturityGdd: 2400,
    stages: SOYBEAN_STAGES_INTERMEDIATE,
    criticalPhotoperiod: 13.0,
    maturityPtu: 31000,
  },

  // ── Wheat ──
  'wheat-short': {
    label: 'Wheat — Short (Spring)',
    baseCrop: 'wheat',
    maturityLabel: 'Short / Spring (~1500 GDD)',
    baseTempF: 32,
    upperCapF: null,
    maturityGdd: 1500,
    stages: WHEAT_STAGES_SHORT,
    vernalizationTarget: 200,
  },
  'wheat-intermediate': {
    label: 'Wheat — Intermediate',
    baseCrop: 'wheat',
    maturityLabel: 'Intermediate / Facultative (~1750 GDD)',
    baseTempF: 32,
    upperCapF: null,
    maturityGdd: 1750,
    stages: WHEAT_STAGES_INTERMEDIATE,
    vernalizationTarget: 500,
  },
  'wheat-long': {
    label: 'Wheat — Long (Winter)',
    baseCrop: 'wheat',
    maturityLabel: 'Long / Winter (~2100 GDD)',
    baseTempF: 32,
    upperCapF: null,
    maturityGdd: 2100,
    stages: WHEAT_STAGES_LONG,
    vernalizationTarget: 1000,
  },
  // bare alias → intermediate
  wheat: {
    label: 'Wheat — Intermediate',
    baseCrop: 'wheat',
    maturityLabel: 'Intermediate / Facultative (~1750 GDD)',
    baseTempF: 32,
    upperCapF: null,
    maturityGdd: 1750,
    stages: WHEAT_STAGES_INTERMEDIATE,
    vernalizationTarget: 500,
  },
};

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Extract the base crop species from a compound cropType */
export function getBaseCrop(cropType: string): BaseCrop {
  if (cropType.startsWith('corn')) return 'corn';
  if (cropType.startsWith('soybean')) return 'soybean';
  if (cropType.startsWith('wheat')) return 'wheat';
  return 'corn'; // fallback
}

/** Normalize bare crop types to their -intermediate form for UI consistency */
export function normalizeCropType(cropType: string): CropType {
  if (cropType === 'corn') return 'corn-intermediate';
  if (cropType === 'soybean') return 'soybean-intermediate';
  if (cropType === 'wheat') return 'wheat-intermediate';
  if (cropType in CROP_CONFIGS) return cropType as CropType;
  return 'corn-intermediate';
}

/** Get config for any crop type string (handles bare + compound) */
export function getCropConfig(cropType: string): CropConfig {
  return CROP_CONFIGS[cropType as CropType] ?? CROP_CONFIGS.corn;
}

/** Key stages for the summary dots display */
export function getKeyStages(cropType: string): string[] {
  const base = getBaseCrop(cropType);
  switch (base) {
    case 'corn':
      return ['VE', 'V6', 'V12', 'VT', 'R1', 'R4', 'R6'];
    case 'soybean':
      return ['VE', 'V3', 'R1', 'R3', 'R5', 'R7', 'R8'];
    case 'wheat':
      return ['E', 'T', 'SE', 'HD', 'AN', 'DG', 'MT'];
  }
}

/** Dropdown options for FieldForm, grouped by crop species */
export interface CropDropdownOption {
  value: CropType;
  label: string;
  group: string;
}

export const CROP_DROPDOWN_OPTIONS: CropDropdownOption[] = [
  { value: 'corn-short', label: 'Short (~2200 GDD)', group: 'Corn' },
  { value: 'corn-intermediate', label: 'Intermediate (~2500 GDD)', group: 'Corn' },
  { value: 'corn-long', label: 'Long (~2800 GDD)', group: 'Corn' },
  { value: 'soybean-short', label: 'Short (MG III-IV)', group: 'Soybean' },
  { value: 'soybean-intermediate', label: 'Intermediate (MG V-VI)', group: 'Soybean' },
  { value: 'soybean-long', label: 'Long (MG VII-VIII)', group: 'Soybean' },
  { value: 'wheat-short', label: 'Short / Spring (~1500 GDD)', group: 'Wheat' },
  { value: 'wheat-intermediate', label: 'Intermediate (~1750 GDD)', group: 'Wheat' },
  { value: 'wheat-long', label: 'Long / Winter (~2100 GDD)', group: 'Wheat' },
];
