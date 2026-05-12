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
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { DailyEto, DailyRain } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface EtoChartProps {
  data: DailyEto[];
  rainData?: DailyRain[];
}

export function EtoChart({ data, rainData }: EtoChartProps) {
  const styles = getComputedStyle(document.documentElement);
  const blue = styles.getPropertyValue('--blue').trim() || '#185FA5';
  const blueM = styles.getPropertyValue('--blue-m').trim() || '#378ADD';
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const teal = '#1a9988';

  const hasRain = rainData && rainData.length > 0;

  // Build a unified date list from ETo dataset
  const labels = data.map((d) => d.date);

  // Create a map for quick rain lookup by date
  const rainMap = new Map<string, DailyRain>();
  if (rainData) {
    for (const r of rainData) {
      rainMap.set(r.date, r);
    }
  }

  // Compute axis max values (20% headroom like GDD chart)
  const maxDailyEto = data.length > 0 ? Math.max(...data.map((d) => d.eto)) : 0;
  const maxDailyRain = hasRain ? Math.max(...rainData.map((r) => r.rain)) : 0;
  const dailyEtoMax = Math.ceil(maxDailyEto * 1.2 * 10) / 10; // round to 1 decimal
  const dailyRainMax = hasRain ? Math.ceil(maxDailyRain * 1.2 * 10) / 10 : 10;

  const chartData = useMemo(() => {
    const datasets = [
      {
        type: 'bar' as const,
        label: 'Daily ETo (mm)',
        data: data.map((d) => d.eto),
        backgroundColor: `${blueM}80`,
        borderColor: blueM,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'yEto',
        order: 3,
      },
      ...(hasRain
        ? [
            {
              type: 'bar' as const,
              label: 'Daily Rain (mm)',
              data: labels.map((date) => rainMap.get(date)?.rain ?? 0),
              backgroundColor: `${teal}70`,
              borderColor: teal,
              borderWidth: 1,
              borderRadius: 3,
              yAxisID: 'yRain',
              order: 2,
            },
          ]
        : []),
      {
        type: 'line' as const,
        label: 'Cumulative ETo (mm)',
        data: data.map((d) => d.cumulative),
        borderColor: blue,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: data.length > 60 ? 0 : 2,
        pointHoverRadius: 5,
        yAxisID: 'yCum',
        order: 1,
      },
      ...(hasRain
        ? [
            {
              type: 'line' as const,
              label: 'Cumulative Rain (mm)',
              data: labels.map((date) => rainMap.get(date)?.cumulative ?? null),
              borderColor: teal,
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [5, 3],
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
              yAxisID: 'yCum',
              order: 0,
            },
          ]
        : []),
    ];

    return {
      labels: labels.map((d) => format(parseISO(d), 'MMM d')),
      datasets,
    };
  }, [data, rainData, blue, blueM, teal, hasRain, labels, rainMap]);

  const scales: ChartOptions<'bar'>['scales'] = {
    x: {
      ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
      grid: { display: false },
    },
    // Left outer axis: Daily ETo
    yEto: {
      position: 'left',
      title: { display: true, text: 'Daily ETo (mm)', font: { size: 10 }, color: blueM },
      ticks: { font: { size: 9 }, color: blueM },
      grid: { color: `${tx3}15` },
      beginAtZero: true,
      max: dailyEtoMax,
    },
    // Right axis: Cumulative (shared scale for ETo & Rain comparison)
    yCum: {
      position: 'right',
      title: { display: true, text: 'Cumulative (mm)', font: { size: 10 }, color: tx3 },
      ticks: { font: { size: 9 }, color: tx3 },
      grid: { display: false },
      beginAtZero: true,
    },
  };

  if (hasRain) {
    // Left inner axis: Daily Rain (own scale next to Daily ETo)
    scales.yRain = {
      position: 'left',
      title: { display: true, text: 'Daily Rain (mm)', font: { size: 10 }, color: teal },
      ticks: { font: { size: 9 }, color: teal },
      grid: { display: false },
      beginAtZero: true,
      max: dailyRainMax,
    };
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          font: { size: 11 },
          color: tx3,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y ?? 0;
            const label = ctx.dataset.label || '';
            if (label.includes('Daily')) return `${label}: ${val.toFixed(2)} mm`;
            return `${label}: ${val.toFixed(1)} mm`;
          },
        },
      },
    },
    scales,
  };

  const lastEto = data.length > 0 ? data[data.length - 1] : null;
  const lastRain = rainData && rainData.length > 0 ? rainData[rainData.length - 1] : null;

  return (
    <div className="agraria-card">
      <div className="flex items-center justify-between mb-1">
        <div className="sec-label mb-0">{hasRain ? 'Water Balance (ETo & Rainfall)' : 'Reference Evapotranspiration (ETo)'}</div>
      </div>
      {(lastEto || lastRain) && (
        <div className={`agraria-info-row grid gap-2 mb-3 ${hasRain ? 'grid-cols-4' : 'grid-cols-2'}`}>
          {lastEto && (
            <>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>ETo Daily</div>
                <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                  {lastEto.eto.toFixed(2)} <span className="text-[11px] font-normal opacity-70">mm</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>ETo Cum.</div>
                <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                  {lastEto.cumulative.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
                </div>
              </div>
            </>
          )}
          {lastRain && (
            <>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Rain Daily</div>
                <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                  {lastRain.rain.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Rain Cum.</div>
                <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                  {lastRain.cumulative.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ height: '280px' }}>
        {/* @ts-expect-error mixed chart type */}
        <Chart type="bar" data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        {hasRain
          ? 'ETo: FAO Penman-Monteith. Blue bars = daily ETo, Green bars = daily rainfall, Lines = cumulative. Each metric has its own axis scale.'
          : 'FAO Penman-Monteith method. Bars = daily ETo (left axis), Line = cumulative (right axis).'}
      </p>
    </div>
  );
}
