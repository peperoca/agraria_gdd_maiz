import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getCropConfig, getKeyStages, getBaseCrop, type CropType } from '../utils/cropConfig';
import type { CornStage, DailyGdd } from '../types';
import type { PtuDay } from '../utils/photoperiod';
import type { VernalizationDay } from '../utils/vernalization';

interface GrowthStagesProps {
  cumulativeGdd: number;
  gddData?: DailyGdd[];
  cropType?: CropType;
  ptuData?: PtuDay[] | null;
  vernData?: VernalizationDay[] | null;
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

function buildSecondaryDateMap(
  dailyValues: { date: string; cumulative: number }[],
  stages: CornStage[],
  getThreshold: (s: CornStage) => number | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (dailyValues.length === 0) return map;

  let stageIdx = 0;
  for (const day of dailyValues) {
    while (stageIdx < stages.length) {
      const threshold = getThreshold(stages[stageIdx]);
      if (threshold != null && day.cumulative >= threshold) {
        map.set(stages[stageIdx].shortName, day.date);
        stageIdx++;
      } else break;
    }
    if (stageIdx >= stages.length) break;
  }
  return map;
}

export function GrowthStages({ cumulativeGdd, gddData, cropType = 'corn', ptuData, vernData }: GrowthStagesProps) {
  const { t } = useTranslation();
  const config = getCropConfig(cropType);
  const allStages = config.stages;
  const keyStageNames = getKeyStages(cropType);
  const keyStages = allStages.filter((s) => keyStageNames.includes(s.shortName));
  const stageDateMap = gddData ? buildStageDateMap(gddData, allStages) : new Map<string, string>();

  const baseCrop = getBaseCrop(cropType);

  // Secondary metric: PTU (soybean) or Vd (wheat)
  const hasPtu = baseCrop === 'soybean' && ptuData && ptuData.length > 0 && allStages.some((s) => s.ptu != null);
  const hasVd = baseCrop === 'wheat' && vernData && vernData.length > 0 && allStages.some((s) => s.vd != null);
  const hasSecondary = hasPtu || hasVd;

  const secondaryLabel = hasPtu ? 'PTU' : 'Vd';
  const secondaryColor = hasPtu ? 'var(--orange)' : '#7c3aed';

  const secondaryDailyValues = hasPtu
    ? ptuData!.map((d) => ({ date: d.date, cumulative: d.cumulativePtu }))
    : hasVd
    ? vernData!.map((d) => ({ date: d.date, cumulative: d.cumulativeVd }))
    : [];

  const getSecondaryThreshold = (s: CornStage) => hasPtu ? s.ptu : hasVd ? s.vd : undefined;
  const secondaryStageDateMap = hasSecondary
    ? buildSecondaryDateMap(secondaryDailyValues, allStages, getSecondaryThreshold)
    : new Map<string, string>();
  const cumulativeSecondary = secondaryDailyValues.length > 0 ? secondaryDailyValues[secondaryDailyValues.length - 1].cumulative : 0;

  // Find current and next stage (GDD-based)
  let currentStage: CornStage | null = null;
  let nextStage: CornStage | null = null;
  for (const s of allStages) {
    if (cumulativeGdd >= s.gdd) currentStage = s;
    else { nextStage = s; break; }
  }

  // Secondary-based current stage
  let currentStageSecondary: CornStage | null = null;
  let nextStageSecondary: CornStage | null = null;
  if (hasSecondary) {
    for (const s of allStages) {
      const threshold = getSecondaryThreshold(s);
      if (threshold != null && cumulativeSecondary >= threshold) currentStageSecondary = s;
      else if (threshold != null && !nextStageSecondary) { nextStageSecondary = s; break; }
    }
  }

  return (
    <div className="agraria-card space-y-3">
      <div className="sec-label">{t('growthStages.title')}</div>

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
                {t('growthStages.reached', { date: format(parseISO(stageDateMap.get(currentStage.shortName)!), 'MMM d') })}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--it)', opacity: 0.75 }}>
            {currentStage.description}
          </p>
        </div>
      )}

      {/* Secondary metric current stage (soybean PTU / wheat Vd) */}
      {hasSecondary && currentStageSecondary && currentStageSecondary.shortName !== currentStage?.shortName && (
        <div className="agraria-info-row">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: secondaryColor, color: '#fff' }}>{secondaryLabel}</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--it)' }}>
              {currentStageSecondary.shortName} — {currentStageSecondary.name}
            </span>
            {secondaryStageDateMap.get(currentStageSecondary.shortName) && (
              <span className="text-[10px]" style={{ color: 'var(--it)', opacity: 0.6 }}>
                {t('growthStages.reached', { date: format(parseISO(secondaryStageDateMap.get(currentStageSecondary.shortName)!), 'MMM d') })}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--it)', opacity: 0.75 }}>
            {currentStageSecondary.description}
          </p>
        </div>
      )}

      {/* Next milestone */}
      {nextStage && (
        <div className="rounded-[var(--r)] p-2.5" style={{ background: 'var(--wb)' }}>
          <p className="text-[11px]" style={{ color: 'var(--wt)' }}>
            <span className="font-semibold">{t('growthStages.nextGdd', { stage: nextStage.shortName, name: nextStage.name, gdd: nextStage.gdd })}</span>
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--wt)', opacity: 0.75 }}>
            {t('growthStages.gddRemaining', { amount: Math.round(nextStage.gdd - cumulativeGdd) })}
          </p>
          {hasSecondary && nextStageSecondary && (() => {
            const threshold = getSecondaryThreshold(nextStageSecondary);
            return threshold != null ? (
              <p className="text-[11px] mt-1" style={{ color: 'var(--wt)', opacity: 0.75 }}>
                <span className="font-semibold">{t('growthStages.nextSecondary', { label: secondaryLabel, stage: nextStageSecondary.shortName, value: `${threshold.toLocaleString()} ${secondaryLabel}` })}</span> — {t('growthStages.secondaryRemaining', { amount: Math.round(threshold - cumulativeSecondary).toLocaleString() })}
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* All stages table */}
      <details className="text-xs">
        <summary className="cursor-pointer hover:opacity-80 font-medium" style={{ color: 'var(--tx3)' }}>
          {t('growthStages.viewAllStages')}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--bdr2)' }}>
                <th className="text-left py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}></th>
                <th className="text-left py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('growthStages.stageCol')}</th>
                <th className="text-left py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('growthStages.nameCol')}</th>
                <th className="text-right py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('growthStages.gddCol')}</th>
                {hasSecondary && <th className="text-right py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{secondaryLabel}</th>}
                <th className="text-right py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{t('growthStages.dateCol')}</th>
                {hasSecondary && <th className="text-right py-1 px-1.5 font-semibold text-[11px]" style={{ color: 'var(--tx3)' }}>{secondaryLabel} {t('growthStages.dateCol')}</th>}
              </tr>
            </thead>
            <tbody>
              {allStages.map((stage) => {
                const isPastGdd = cumulativeGdd >= stage.gdd;
                const secThreshold = getSecondaryThreshold(stage);
                const isPastSec = hasSecondary && secThreshold != null && cumulativeSecondary >= secThreshold;
                const dateReached = stageDateMap.get(stage.shortName);
                const secDateReached = secondaryStageDateMap.get(stage.shortName);
                return (
                  <tr
                    key={stage.shortName}
                    style={{
                      borderBottom: '0.5px solid var(--bdr)',
                      color: isPastGdd ? 'var(--it)' : 'var(--tx3)',
                    }}
                  >
                    <td className="py-1 px-1.5 text-center">{isPastGdd ? '✓' : '○'}</td>
                    <td className="py-1 px-1.5 font-medium">{stage.shortName}</td>
                    <td className="py-1 px-1.5">{stage.name}</td>
                    <td className="py-1 px-1.5 text-right">{stage.gdd}</td>
                    {hasSecondary && (
                      <td className="py-1 px-1.5 text-right" style={{ color: isPastSec ? secondaryColor : 'var(--tx3)' }}>
                        {secThreshold != null ? secThreshold.toLocaleString() : '—'}
                      </td>
                    )}
                    <td className="py-1 px-1.5 text-right" style={{ color: isPastGdd ? 'var(--blue)' : 'var(--tx3)' }}>
                      {dateReached ? format(parseISO(dateReached), 'MMM d') : '—'}
                    </td>
                    {hasSecondary && (
                      <td className="py-1 px-1.5 text-right" style={{ color: isPastSec ? secondaryColor : 'var(--tx3)' }}>
                        {secDateReached ? format(parseISO(secDateReached), 'MMM d') : '—'}
                      </td>
                    )}
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
