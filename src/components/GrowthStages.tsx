import { format, parseISO } from 'date-fns';
import { getCropConfig, getKeyStages, type CropType } from '../utils/cropConfig';
import type { CornStage, DailyGdd } from '../types';

interface GrowthStagesProps {
  cumulativeGdd: number;
  gddData?: DailyGdd[];
  cropType?: CropType;
}

/**
 * For each stage, find the first day in gddData where cumulative >= stage.gdd.
 */
function buildStageDateMap(gddData: DailyGdd[], stages: CornStage[]): Map<string, string> {
  const map = new Map<string, string>();
  if (gddData.length === 0) return map;

  let stageIdx = 0;
  for (const day of gddData) {
    while (stageIdx < stages.length && day.cumulative >= stages[stageIdx].gdd) {
      map.set(stages[stageIdx].shortName, day.date);
      stageIdx++;
    }
    if (stageIdx >= stages.length) break;
  }
  return map;
}

export function GrowthStages({ cumulativeGdd, gddData, cropType = 'corn' }: GrowthStagesProps) {
  const config = getCropConfig(cropType);
  const allStages = config.stages;
  const keyStageNames = getKeyStages(cropType);
  const keyStages = allStages.filter((s) => keyStageNames.includes(s.shortName));
  const stageDateMap = gddData ? buildStageDateMap(gddData, allStages) : new Map<string, string>();

  // Find current and next stage
  let currentStage: CornStage | null = null;
  let nextStage: CornStage | null = null;
  for (const s of allStages) {
    if (cumulativeGdd >= s.gdd) currentStage = s;
    else { nextStage = s; break; }
  }

  return (
    <div className="agraria-card space-y-3">
      <div className="sec-label">Growth Stages</div>

      {/* Stage progress dots */}
      <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
        {keyStages.map((stage, i) => {
          const isPast = cumulativeGdd >= stage.gdd;
          const isCurrent = currentStage?.shortName === stage.shortName;
          const dateReached = stageDateMap.get(stage.shortName);

          return (
            <div key={stage.shortName} className="flex items-center">
              {i > 0 && (
                <div
                  className="h-[2px] w-4 sm:w-5"
                  style={{ background: isPast ? 'var(--blue)' : 'var(--surface3)' }}
                />
              )}
              <div className="flex flex-col items-center">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all"
                  style={{
                    background: isCurrent ? 'var(--blue)' : isPast ? 'var(--blue-m)' : 'var(--surface)',
                    color: isCurrent || isPast ? '#fff' : 'var(--tx3)',
                    borderColor: isCurrent ? 'var(--blue)' : isPast ? 'var(--blue-m)' : 'var(--bdr2)',
                    transform: isCurrent ? 'scale(1.15)' : 'scale(1)',
                    boxShadow: isCurrent ? '0 0 0 3px var(--blue-l)' : 'none',
                  }}
                >
                  {isPast && !isCurrent ? '✓' : stage.shortName}
                </div>
                <span
                  className="text-[9px] mt-1 whitespace-nowrap"
                  style={{ color: isCurrent ? 'var(--blue)' : 'var(--tx3)' }}
                >
                  {dateReached ? format(parseISO(dateReached), 'MMM d') : stage.gdd}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current stage info */}
      {currentStage && (
        <div className="agraria-info-row">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--it)' }}>
              {currentStage.shortName} — {currentStage.name}
            </span>
            {stageDateMap.get(currentStage.shortName) && (
              <span className="text-[10px]" style={{ color: 'var(--it)', opacity: 0.6 }}>
                reached {format(parseISO(stageDateMap.get(currentStage.shortName)!), 'MMM d')}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--it)', opacity: 0.75 }}>
            {currentStage.description}
          </p>
        </div>
      )}

      {/* Next milestone */}
      {nextStage && (
        <div className="rounded-[var(--r)] p-2.5" style={{ background: 'var(--wb)' }}>
          <p className="text-[11px]" style={{ color: 'var(--wt)' }}>
            <span className="font-semibold">Next:</span> {nextStage.shortName} — {nextStage.name} at {nextStage.gdd} GDD
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--wt)', opacity: 0.75 }}>
            {Math.round(nextStage.gdd - cumulativeGdd)} GDD remaining
          </p>
        </div>
      )}

      {/* All stages table */}
      <details className="text-xs">
        <summary className="cursor-pointer hover:opacity-80 font-medium" style={{ color: 'var(--tx3)' }}>
          View all stages
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--bdr2)' }}>
                <th className="text-left py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}></th>
                <th className="text-left py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>Stage</th>
                <th className="text-left py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>Name</th>
                <th className="text-right py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>GDD</th>
                <th className="text-right py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {allStages.map((stage) => {
                const isPast = cumulativeGdd >= stage.gdd;
                const dateReached = stageDateMap.get(stage.shortName);
                return (
                  <tr
                    key={stage.shortName}
                    style={{
                      borderBottom: '0.5px solid var(--bdr)',
                      color: isPast ? 'var(--it)' : 'var(--tx3)',
                    }}
                  >
                    <td className="py-1 px-1.5 text-center">{isPast ? '✓' : '○'}</td>
                    <td className="py-1 px-1.5 font-medium">{stage.shortName}</td>
                    <td className="py-1 px-1.5">{stage.name}</td>
                    <td className="py-1 px-1.5 text-right">{stage.gdd}</td>
                    <td className="py-1 px-1.5 text-right" style={{ color: isPast ? 'var(--blue)' : 'var(--tx3)' }}>
                      {dateReached ? format(parseISO(dateReached), 'MMM d') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
