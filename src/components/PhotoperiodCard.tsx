import type { DailyGdd } from '../types';
import { calculateDaylength, getDayOfYear, calculatePtu } from '../utils/photoperiod';

interface PhotoperiodCardProps {
  latitude: number;
  sowingDate: string;
  criticalPhotoperiod: number;
  cropLabel: string;
  gddData: DailyGdd[];
  maturityPtu?: number;
}

export function PhotoperiodCard({
  latitude,
  criticalPhotoperiod,
  cropLabel,
  gddData,
  maturityPtu,
}: PhotoperiodCardProps) {
  // Current daylength
  const today = new Date().toISOString().slice(0, 10);
  const doy = getDayOfYear(today);
  const daylength = calculateDaylength(latitude, doy);
  const diff = daylength - criticalPhotoperiod;

  // PTU calculation
  const ptuData = calculatePtu(gddData, latitude);
  const latestPtu = ptuData.length > 0 ? ptuData[ptuData.length - 1] : null;

  // Status
  let photoStatus: 'above' | 'approaching' | 'below' = 'above';
  let statusColor = 'var(--tx3)';
  let statusIcon = '☀️';
  if (diff <= 0) {
    photoStatus = 'below';
    statusColor = '#2d8a4e';
    statusIcon = '🌸';
  } else if (diff <= 0.5) {
    photoStatus = 'approaching';
    statusColor = 'var(--orange)';
    statusIcon = '⏳';
  }

  // Daylength bar visualization (10h to 16h range)
  const barMin = 10;
  const barMax = 16;
  const daylengthPct = Math.max(0, Math.min(100, ((daylength - barMin) / (barMax - barMin)) * 100));
  const criticalPct = Math.max(0, Math.min(100, ((criticalPhotoperiod - barMin) / (barMax - barMin)) * 100));

  return (
    <div className="agraria-card">
      <div className="sec-label">Photoperiod & PTU — {cropLabel}</div>

      <div className="agraria-info-row grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Daylength</div>
          <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
            {daylength.toFixed(1)}h
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Critical</div>
          <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
            {criticalPhotoperiod}h
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Status</div>
          <div className="text-base font-semibold" style={{ color: statusColor }}>
            {statusIcon} {photoStatus === 'below' ? 'Active' : photoStatus === 'approaching' ? 'Near' : 'Waiting'}
          </div>
        </div>
      </div>

      {/* Daylength visual bar */}
      <div className="relative h-6 rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--surface2)' }}>
        {/* Current daylength fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-[var(--r)] transition-all"
          style={{
            width: `${daylengthPct}%`,
            background: photoStatus === 'below'
              ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
              : 'linear-gradient(90deg, #fcd34d, #fbbf24)',
          }}
        />
        {/* Critical threshold line */}
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${criticalPct}%`,
            width: '2px',
            background: '#dc2626',
          }}
        />
        {/* Labels inside bar */}
        <div className="absolute inset-0 flex items-center justify-between px-2">
          <span className="text-[9px] font-medium relative z-10" style={{ color: '#78350f' }}>
            {daylength.toFixed(1)}h
          </span>
          <span className="text-[9px] font-medium relative z-10" style={{ color: 'var(--tx3)' }}>
            {barMin}h — {barMax}h
          </span>
        </div>
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>Short days</span>
        <span className="text-[9px]" style={{ color: '#dc2626' }}>← Critical: {criticalPhotoperiod}h</span>
        <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>Long days</span>
      </div>

      {/* PTU section */}
      {latestPtu && (
        <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid var(--bdr)' }}>
          <div className="agraria-info-row grid grid-cols-3 gap-2">
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Cum. PTU</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                {latestPtu.cumulativePtu.toLocaleString()}
              </div>
            </div>
            {maturityPtu && (
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Target PTU</div>
                <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                  ~{(maturityPtu / 1000).toFixed(0)}k
                </div>
              </div>
            )}
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Today PTU</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                +{latestPtu.dailyPtu.toFixed(0)}
              </div>
            </div>
          </div>

          {maturityPtu && (
            <>
              <div className="agraria-progress-bar mt-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((latestPtu.cumulativePtu / maturityPtu) * 100))}%`,
                    background: 'linear-gradient(90deg, var(--orange), #f59e0b)',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>
                  {Math.min(100, Math.round((latestPtu.cumulativePtu / maturityPtu) * 100))}% PTU to maturity
                </span>
                <span className="text-[10px]" style={{ color: 'var(--tx3)' }}>
                  ~{maturityPtu.toLocaleString()} PTU
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        Soybean is a short-day plant — flowering triggered when daylength drops below critical threshold.
        PTU (GDD × daylength) combines thermal and photoperiod effects.
      </p>
    </div>
  );
}
