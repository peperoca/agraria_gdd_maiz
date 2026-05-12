import type { CornStage } from '../types';

/**
 * Corn growth stages and their GDD requirements.
 * Source: Bayer Crop Science
 * https://www.cropscience.bayer.us/articles/bayer/corn-growth-stages-and-gdu-requirements
 */
export const CORN_STAGES: CornStage[] = [
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

/** Total GDD needed for full maturity */
export const MATURITY_GDD = 2700;

/**
 * Get the current growth stage based on accumulated GDD
 */
export function getCurrentStage(cumulativeGdd: number): CornStage | null {
  let current: CornStage | null = null;
  for (const stage of CORN_STAGES) {
    if (cumulativeGdd >= stage.gdd) {
      current = stage;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Get the next growth stage based on accumulated GDD
 */
export function getNextStage(cumulativeGdd: number): CornStage | null {
  for (const stage of CORN_STAGES) {
    if (cumulativeGdd < stage.gdd) {
      return stage;
    }
  }
  return null;
}

/**
 * Get progress percentage towards maturity (0-100)
 */
export function getProgressPercent(cumulativeGdd: number): number {
  return Math.min(100, Math.round((cumulativeGdd / MATURITY_GDD) * 100));
}
