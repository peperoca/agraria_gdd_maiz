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
import annotationPlugin from 'chartjs-plugin-annotation';
import { Chart } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { DailyGdd } from '../types';
import { CORN_STAGES } from '../utils/cornStages';

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
  Legend,
  Filler,
  annotationPlugin
);

interface GddChartProps {
  data: DailyGdd[];
}

export function GddChart({ data }: GddChartProps) {
  const maxGdd = data.length > 0 ? data[data.length - 1].cumulative : 0;
  const maxDailyGdd = data.length > 0 ? Math.max(...data.map((d) => d.gdd)) : 0;
  const dailyAxisMax = Math.ceil(maxDailyGdd * 1.2);
  const relevantStages = CORN_STAGES.filter((s) => s.gdd <= maxGdd * 1.5 + 200);

  const styles = getComputedStyle(document.documentElement);
  const blue = styles.getPropertyValue('--blue').trim() || '#185FA5';
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';

  const chartData = useMemo(
    () => ({
      labels: data.map((d) => format(parseISO(d.date), 'MMM d')),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Daily GDD',
          data: data.map((d) => d.gdd),
          backgroundColor: `${orange}80`,
          borderColor: orange,
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Cumulative GDD',
          data: data.map((d) => d.cumulative),
          borderColor: blue,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: data.length > 60 ? 0 : 2,
          pointHoverRadius: 5,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    }),
    [data, blue, orange]
  );

  const annotations: Record<string, object> = {};
  for (const stage of relevantStages) {
    annotations[`line_${stage.shortName}`] = {
      type: 'line',
      scaleID: 'y1',
      yMin: stage.gdd,
      yMax: stage.gdd,
      borderColor: `${tx3}50`,
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: `${stage.shortName} (${stage.gdd})`,
        position: 'start',
        font: { size: 10 },
        color: tx3,
        backgroundColor: `${surface}cc`,
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
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
            if (ctx.datasetIndex === 0) return `Daily: +${val.toFixed(1)} GDD`;
            return `Cumulative: ${val.toFixed(0)} GDD`;
          },
        },
      },
      annotation: { annotations },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      y: {
        position: 'left',
        title: { display: true, text: 'Daily GDD', font: { size: 11 }, color: tx3 },
        ticks: { font: { size: 10 }, color: tx3 },
        grid: { color: `${tx3}15` },
        beginAtZero: true,
        max: dailyAxisMax,
      },
      y1: {
        position: 'right',
        title: { display: true, text: 'Cumulative GDD', font: { size: 11 }, color: tx3 },
        ticks: { font: { size: 10 }, color: tx3 },
        grid: { display: false },
        beginAtZero: true,
      },
    },
  };

  const lastGdd = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="agraria-card">
      <div className="flex items-center justify-between mb-1">
        <div className="sec-label mb-0">GDD Accumulation</div>
      </div>
      {lastGdd && (
        <div className="agraria-info-row grid grid-cols-2 gap-2 mb-3">
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Latest Daily</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              +{lastGdd.gdd.toFixed(1)} <span className="text-[11px] font-normal opacity-70">GDD</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Cumulative</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {lastGdd.cumulative.toFixed(0)} <span className="text-[11px] font-normal opacity-70">GDD</span>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: '280px' }}>
        {/* @ts-expect-error mixed chart type with annotation plugin */}
        <Chart type="bar" data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        Bars = daily GDD (left axis), Line = cumulative (right axis). Dashed lines = growth stages.
      </p>
    </div>
  );
}
