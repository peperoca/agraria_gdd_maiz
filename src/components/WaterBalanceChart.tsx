import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { DailyRain, DailyETc, DailyIrrigation } from '../types';

ChartJS.register(
  CategoryScale, LinearScale, BarController, LineController,
  PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler
);

interface WaterBalanceChartProps {
  etcData: DailyETc[];
  rainData: DailyRain[];
  irrigationData?: DailyIrrigation[] | null;
}

export function WaterBalanceChart({ etcData, rainData, irrigationData }: WaterBalanceChartProps) {
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const teal = '#1a9988';
  const red = '#dc2626';
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';

  const hasIrrigation = irrigationData && irrigationData.length > 0;

  // Build unified date list
  const allDates = new Set<string>();
  etcData.forEach((d) => allDates.add(d.date));
  rainData.forEach((d) => allDates.add(d.date));
  irrigationData?.forEach((d) => allDates.add(d.date));
  const dates = Array.from(allDates).sort();

  const rainMap = new Map(rainData.map((r) => [r.date, r]));
  const etcMap = new Map(etcData.map((e) => [e.date, e]));
  const irrigMap = new Map((irrigationData ?? []).map((i) => [i.date, i]));

  // Compute cumulative water balance = Cum Rain + Cum Irrigation - Cum ETc
  const balanceData = useMemo(() => {
    let cumRain = 0;
    let cumEtc = 0;
    let cumIrrig = 0;
    return dates.map((date) => {
      const rain = rainMap.get(date);
      const etc = etcMap.get(date);
      const irrig = irrigMap.get(date);
      if (rain) cumRain = rain.cumulative;
      if (etc) cumEtc = etc.cumulative;
      if (irrig) cumIrrig += irrig.depthMm;
      return {
        date,
        cumRain,
        cumEtc,
        cumIrrig,
        balance: Math.round((cumRain + cumIrrig - cumEtc) * 100) / 100,
      };
    });
  }, [dates, rainMap, etcMap, irrigMap]);

  const lastBalance = balanceData.length > 0 ? balanceData[balanceData.length - 1] : null;

  const chartData = useMemo(() => {
    const datasets = [
      {
        type: 'line' as const,
        label: 'Cum. Rain (mm)',
        data: balanceData.map((d) => d.cumRain),
        borderColor: teal,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 1,
      },
      {
        type: 'line' as const,
        label: 'Cum. ETc (mm)',
        data: balanceData.map((d) => d.cumEtc),
        borderColor: red,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 2,
      },
      ...(hasIrrigation ? [{
        type: 'line' as const,
        label: 'Cum. Irrigation (mm)',
        data: balanceData.map((d) => d.cumIrrig),
        borderColor: orange,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 3],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 3,
      }] : []),
      {
        type: 'line' as const,
        label: 'Balance (mm)',
        data: balanceData.map((d) => d.balance),
        borderColor: '#6366f1',
        backgroundColor: '#6366f120',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        fill: true,
        order: 0,
      },
    ];
    return {
      labels: dates.map((d) => format(parseISO(d), 'MMM d')),
      datasets,
    };
  }, [balanceData, dates, teal, red, orange, hasIrrigation]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { usePointStyle: true, font: { size: 11 }, color: tx3 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)} mm`,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: 'mm', font: { size: 10 }, color: tx3 },
        ticks: { font: { size: 9 }, color: tx3 },
        grid: { color: `${tx3}15` },
      },
    },
  };

  return (
    <div className="agraria-card">
      <div className="sec-label">Water Balance ({hasIrrigation ? 'Rain + Irrigation' : 'Rain'} vs ETc)</div>
      {lastBalance && (
        <div className={`agraria-info-row grid gap-2 mb-3 ${hasIrrigation ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Rain</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastBalance.cumRain.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
          {hasIrrigation && (
            <div>
              <div className="text-[11px] opacity-75" style={{ color: orange }}>Irrig.</div>
              <div className="text-base font-semibold" style={{ color: orange }}>
                {lastBalance.cumIrrig.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
              </div>
            </div>
          )}
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>ETc</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastBalance.cumEtc.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Balance</div>
            <div className="text-base font-semibold" style={{
              color: lastBalance.balance >= 0 ? teal : red,
            }}>
              {lastBalance.balance >= 0 ? '+' : ''}{lastBalance.balance.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: '240px' }}>
        {/* @ts-expect-error mixed chart type */}
        <Chart type="line" data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        ETc = ETo x Kc (NDVI-derived). Balance = Cumulative Rain{hasIrrigation ? ' + Irrigation' : ''} - Cumulative ETc. Positive = surplus, Negative = deficit.
      </p>
    </div>
  );
}
