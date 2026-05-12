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
import type { DailyRain, DailyETc } from '../types';

ChartJS.register(
  CategoryScale, LinearScale, BarController, LineController,
  PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler
);

interface WaterBalanceChartProps {
  etcData: DailyETc[];
  rainData: DailyRain[];
}

export function WaterBalanceChart({ etcData, rainData }: WaterBalanceChartProps) {
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const teal = '#1a9988';
  const red = '#dc2626';

  // Build unified date list
  const allDates = new Set<string>();
  etcData.forEach((d) => allDates.add(d.date));
  rainData.forEach((d) => allDates.add(d.date));
  const dates = Array.from(allDates).sort();

  const rainMap = new Map(rainData.map((r) => [r.date, r]));
  const etcMap = new Map(etcData.map((e) => [e.date, e]));

  // Compute cumulative water balance = Cum Rain - Cum ETc
  const balanceData = useMemo(() => {
    let cumRain = 0;
    let cumEtc = 0;
    return dates.map((date) => {
      const rain = rainMap.get(date);
      const etc = etcMap.get(date);
      if (rain) cumRain = rain.cumulative;
      if (etc) cumEtc = etc.cumulative;
      return {
        date,
        cumRain,
        cumEtc,
        balance: Math.round((cumRain - cumEtc) * 100) / 100,
      };
    });
  }, [dates, rainMap, etcMap]);

  const lastBalance = balanceData.length > 0 ? balanceData[balanceData.length - 1] : null;

  const chartData = useMemo(() => ({
    labels: dates.map((d) => format(parseISO(d), 'MMM d')),
    datasets: [
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
    ],
  }), [balanceData, dates, teal, red]);

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
      <div className="sec-label">Water Balance (Rain vs ETc)</div>
      {lastBalance && (
        <div className="agraria-info-row grid grid-cols-3 gap-2 mb-3">
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Rain</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastBalance.cumRain.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
            </div>
          </div>
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
        ETc = ETo x Kc (NDVI-derived). Balance = Cumulative Rain - Cumulative ETc. Positive = surplus, Negative = deficit.
      </p>
    </div>
  );
}
