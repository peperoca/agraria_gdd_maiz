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
import type { DailyEto, DailyRain, DailyIrrigation } from '../types';

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
  irrigationData?: DailyIrrigation[] | null;
  onTitleClick?: () => void;
}

export function EtoChart({ data, rainData, irrigationData, onTitleClick }: EtoChartProps) {
  const styles = getComputedStyle(document.documentElement);
  const blue = styles.getPropertyValue('--blue').trim() || '#185FA5';
  const blueM = styles.getPropertyValue('--blue-m').trim() || '#378ADD';
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const teal = '#1a9988';
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';

  const hasRain = rainData && rainData.length > 0;
  const hasIrrigation = irrigationData && irrigationData.length > 0;

  // Build a unified date list from ETo dataset
  const labels = data.map((d) => d.date);

  // Create maps for quick lookup by date
  const rainMap = new Map<string, DailyRain>();
  if (rainData) {
    for (const r of rainData) {
      rainMap.set(r.date, r);
    }
  }
  const irrigMap = new Map<string, DailyIrrigation>();
  if (irrigationData) {
    for (const i of irrigationData) {
      irrigMap.set(i.date, i);
    }
  }

  // Compute cumulative irrigation
  const cumIrrigByDate = useMemo(() => {
    if (!hasIrrigation) return new Map<string, number>();
    let cum = 0;
    const m = new Map<string, number>();
    for (const date of labels) {
      const irr = irrigMap.get(date);
      if (irr) cum += irr.depthMm;
      m.set(date, cum);
    }
    return m;
  }, [labels, irrigMap, hasIrrigation]);

  // Compute axis max values (20% headroom like GDD chart)
  const maxDailyEto = data.length > 0 ? Math.max(...data.map((d) => d.eto)) : 0;
  const maxDailyRain = hasRain ? Math.max(...rainData.map((r) => r.rain)) : 0;
  const maxDailyIrrig = hasIrrigation ? Math.max(...irrigationData.map((i) => i.depthMm)) : 0;
  // ETo and irrigation share a scale (similar magnitude)
  const dailyEtoIrrigMax = Math.ceil(Math.max(maxDailyEto, maxDailyIrrig) * 1.2 * 10) / 10;
  // Rain gets its own scale (can be much larger)
  const dailyRainMax = hasRain ? Math.ceil(maxDailyRain * 1.2 * 10) / 10 : 10;

  const chartData = useMemo(() => {
    const datasets = [
      {
        type: 'bar' as const,
        label: 'Daily ETo (mm)',
        data: data.map((d) => d.eto),
        backgroundColor: data.map((d) =>
          d.source && d.source !== 'station' ? `${blueM}40` : `${blueM}80`
        ),
        borderColor: data.map((d) =>
          d.source && d.source !== 'station' ? `${blueM}90` : blueM
        ),
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
      ...(hasIrrigation
        ? [
            {
              type: 'bar' as const,
              label: 'Daily Irrigation (mm)',
              data: labels.map((date) => irrigMap.get(date)?.depthMm ?? 0),
              backgroundColor: `${orange}70`,
              borderColor: orange,
              borderWidth: 1,
              borderRadius: 3,
              yAxisID: 'yEto',
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
      ...(hasIrrigation
        ? [
            {
              type: 'line' as const,
              label: 'Cumulative Irrigation (mm)',
              data: labels.map((date) => cumIrrigByDate.get(date) ?? null),
              borderColor: orange,
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [3, 2],
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
  }, [data, rainData, irrigationData, blue, blueM, teal, orange, hasRain, hasIrrigation, labels, rainMap, irrigMap, cumIrrigByDate]);

  const scales: ChartOptions<'bar'>['scales'] = {
    x: {
      ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
      grid: { display: false },
    },
    // Left outer axis: Daily ETo + Irrigation (similar magnitude)
    yEto: {
      position: 'left',
      title: { display: true, text: hasIrrigation ? 'ETo / Irrig. (mm)' : 'Daily ETo (mm)', font: { size: 10 }, color: blueM },
      ticks: { font: { size: 9 }, color: blueM },
      grid: { color: `${tx3}15` },
      beginAtZero: true,
      max: dailyEtoIrrigMax,
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
    // Left inner axis: Daily Rain (own scale — rain events can be much larger than ETo)
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
  const lastCumIrrig = hasIrrigation ? cumIrrigByDate.get(labels[labels.length - 1]) ?? 0 : 0;

  const chartTitle = hasRain && hasIrrigation
    ? 'Water Balance (ETo, Rainfall & Irrigation)'
    : hasIrrigation
    ? 'Water Balance (ETo & Irrigation)'
    : hasRain
    ? 'Water Balance (ETo & Rainfall)'
    : 'Reference Evapotranspiration (ETo)';

  // Determine grid columns for summary row
  const summaryColCount = 2 + (hasRain ? 2 : 0) + (hasIrrigation ? 1 : 0);

  return (
    <div className="agraria-card">
      <div className="flex items-center justify-between mb-1">
        {onTitleClick ? (
          <button onClick={onTitleClick} className="sec-label mb-0 cursor-pointer" style={{ background: 'none', border: 'none', padding: 0 }}>
            {chartTitle} <span className="text-[10px] opacity-60">✏️</span>
          </button>
        ) : (
          <div className="sec-label mb-0">{chartTitle}</div>
        )}
      </div>
      {(lastEto || lastRain) && (
        <div className={`agraria-info-row grid gap-2 mb-3`} style={{ gridTemplateColumns: `repeat(${summaryColCount}, minmax(0, 1fr))` }}>
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
          {hasIrrigation && (
            <div>
              <div className="text-[11px] opacity-75" style={{ color: orange }}>Irrig. Cum.</div>
              <div className="text-base font-semibold" style={{ color: orange }}>
                {lastCumIrrig.toFixed(1)} <span className="text-[11px] font-normal opacity-70">mm</span>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ height: '280px' }}>
        {/* @ts-expect-error mixed chart type */}
        <Chart type="bar" data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        {hasRain || hasIrrigation
          ? `ETo: FAO Penman-Monteith. Blue bars = daily ETo${hasRain ? ', Teal bars = daily rainfall' : ''}${hasIrrigation ? ', Green bars = daily irrigation' : ''}, Lines = cumulative. Each metric has its own axis scale.`
          : 'FAO Penman-Monteith method. Bars = daily ETo (left axis), Line = cumulative (right axis).'}
      </p>
    </div>
  );
}
