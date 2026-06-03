import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyGdd, DailyWeatherSummary, DailyASW } from '../types';
import type { CropConfig } from '../utils/cropConfig';
import { calculateRadiationWindow } from '../utils/solarRadiation';

interface RadiationCardProps {
  gddData: DailyGdd[];
  dailySummaries: DailyWeatherSummary[];
  radiationConfig: NonNullable<CropConfig['radiationWindow']>;
  aswData?: DailyASW[] | null;
}

export function RadiationCard({ gddData, dailySummaries, radiationConfig, aswData }: RadiationCardProps) {
  const { t } = useTranslation();

  const status = useMemo(
    () => calculateRadiationWindow(gddData, dailySummaries, radiationConfig, aswData),
    [gddData, dailySummaries, radiationConfig, aswData],
  );

  if (status.phase === 'before-buffer' && (status.daysUntilWindow === null || status.daysUntilWindow > 30)) {
    return null;
  }

  const target = status.referenceMJ.good;
  const current = status.phase === 'past-window' || status.phase === 'in-window' ? status.windowMJ : status.accumulatedMJ;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  let statusColor = 'var(--tx3)';
  let statusIcon = '🕐';
  if (status.phase === 'buffering') {
    statusColor = 'var(--orange)';
    statusIcon = '⏳';
  } else if (status.phase === 'in-window') {
    statusColor = '#3b82f6';
    statusIcon = '☀️';
  } else if (status.phase === 'past-window') {
    if (status.quality === 'good') { statusColor = '#2d8a4e'; statusIcon = '✓'; }
    else if (status.quality === 'adequate') { statusColor = 'var(--orange)'; statusIcon = '~'; }
    else if (status.quality === 'poor') { statusColor = '#dc2626'; statusIcon = '⚠'; }
    else { statusColor = 'var(--tx3)'; statusIcon = '—'; }
  }

  let progressBg = 'linear-gradient(90deg, #60a5fa, #3b82f6)';
  if (status.phase === 'past-window' || (status.phase === 'in-window' && status.windowGddProgress > 75)) {
    if (status.quality === 'good') progressBg = 'linear-gradient(90deg, #2d8a4e, #4ade80)';
    else if (status.quality === 'adequate') progressBg = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    else if (status.quality === 'poor') progressBg = 'linear-gradient(90deg, #dc2626, #f87171)';
  }

  const todayMJ = status.dailyMJ.length > 0 ? status.dailyMJ[status.dailyMJ.length - 1] : null;

  return (
    <div className="agraria-card">
      <div className="sec-label">
        {t('radiation.title', { period: status.periodLabel, defaultValue: `Solar Radiation — ${status.periodLabel}` })}
      </div>

      <div className="agraria-info-row grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>
            {t('radiation.accumulated', { defaultValue: 'Accumulated' })}
          </div>
          <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
            {current.toFixed(0)} <span className="text-[10px] font-normal">MJ/m²</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>
            {t('radiation.target', { defaultValue: 'Target (Good)' })}
          </div>
          <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
            {target} <span className="text-[10px] font-normal">MJ/m²</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>
            {t('radiation.status', { defaultValue: 'Status' })}
          </div>
          <div className="text-base font-semibold" style={{ color: statusColor }}>
            {statusIcon} {pct}%
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="agraria-progress-bar">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: progressBg }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>
          {t('radiation.progressLabel', { current: current.toFixed(0), target, defaultValue: `${current.toFixed(0)} / ${target} MJ/m²` })}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>
          {status.phase === 'past-window'
            ? t(`radiation.quality.${status.quality}`, { defaultValue: status.quality })
            : status.phase === 'in-window'
              ? t('radiation.windowProgress', {
                  pct: status.windowGddProgress,
                  defaultValue: `Window: ${status.windowGddProgress}%`,
                })
              : ''}
        </span>
      </div>

      {/* Forecast countdown */}
      {(status.phase === 'before-buffer' || status.phase === 'buffering') && status.daysUntilWindow !== null && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--orange)' }}>
          {t('radiation.forecastCountdown', {
            days: status.daysUntilWindow,
            rate: status.gddRate,
            defaultValue: `Critical period in ~${status.daysUntilWindow} days (GDD rate: ${status.gddRate}/day)`,
          })}
          {status.forecastWindowStartDate && ` — ~${status.forecastWindowStartDate}`}
        </p>
      )}

      {/* Water stress indicator */}
      {(status.phase === 'in-window' || status.phase === 'past-window') && status.waterStressDays > 0 && (
        <p className="text-[10px] mt-2 font-semibold" style={{ color: status.waterStressPct > 30 ? '#dc2626' : 'var(--orange)' }}>
          {t('radiation.waterStressWarning', {
            days: status.waterStressDays,
            pct: status.waterStressPct,
            defaultValue: `Water stress: ${status.waterStressDays} days (${status.waterStressPct}%) below MAD — reduced radiation use`,
          })}
        </p>
      )}
      {(status.phase === 'in-window' || status.phase === 'past-window') && status.waterStressDays === 0 && aswData && aswData.length > 0 && (
        <p className="text-[10px] mt-2" style={{ color: '#2d8a4e' }}>
          {t('radiation.noWaterStress', { defaultValue: 'No water stress during window' })}
        </p>
      )}

      {/* Today's contribution */}
      {todayMJ && todayMJ.mj > 0 && status.phase !== 'past-window' && (
        <p className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>
          {t('radiation.todayContribution', {
            mj: todayMJ.mj.toFixed(1),
            defaultValue: `Today: +${todayMJ.mj.toFixed(1)} MJ/m²`,
          })}
        </p>
      )}

      <p className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>
        {t('radiation.description', {
          defaultValue: 'Solar radiation accumulated during the critical reproductive window. Higher radiation = higher yield potential.',
        })}
      </p>
    </div>
  );
}
