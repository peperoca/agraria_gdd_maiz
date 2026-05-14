import type { DailyGdd } from '../types';
import { calculateCumulativeVernalization } from '../utils/vernalization';

interface VernalizationCardProps {
  gddData: DailyGdd[];
  target: number;
}

export function VernalizationCard({ gddData, target }: VernalizationCardProps) {
  const vernData = calculateCumulativeVernalization(gddData);
  if (vernData.length === 0) return null;

  const latest = vernData[vernData.length - 1];
  const pct = Math.min(100, Math.round((latest.cumulativeVd / target) * 100));
  const complete = latest.cumulativeVd >= target;

  // Status color
  let statusColor = 'var(--orange)'; // in progress
  let statusIcon = '⏳';
  if (complete) {
    statusColor = '#2d8a4e';
    statusIcon = '✓';
  } else if (pct < 30) {
    statusColor = 'var(--tx3)';
    statusIcon = '❄️';
  }

  return (
    <div className="agraria-card">
      <div className="sec-label">Vernalization (Cold Hours)</div>

      <div className="agraria-info-row grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Vd Hours</div>
          <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
            {Math.round(latest.cumulativeVd)}
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Target</div>
          <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
            {target}
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Status</div>
          <div className="text-base font-semibold" style={{ color: statusColor }}>
            {statusIcon} {pct}%
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="agraria-progress-bar">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: complete
              ? 'linear-gradient(90deg, #2d8a4e, #4ade80)'
              : 'linear-gradient(90deg, #60a5fa, #3b82f6)',
          }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>
          {Math.round(latest.cumulativeVd)} / {target} Vd hours
        </span>
        <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>
          {complete ? 'Complete' : `${target - Math.round(latest.cumulativeVd)} remaining`}
        </span>
      </div>

      {/* Today's contribution */}
      {latest.dailyVd > 0 && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
          Today: +{latest.dailyVd} cold hours (32-45°F / 0-7°C)
        </p>
      )}

      <p className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>
        Vernalization = hours at 0-7°C. Required for wheat to transition to reproductive phase.
      </p>
    </div>
  );
}
