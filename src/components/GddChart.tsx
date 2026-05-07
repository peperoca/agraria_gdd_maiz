import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { DailyGdd } from '../types';
import { CORN_STAGES } from '../utils/cornStages';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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

  // Only show stages that are near or below current GDD + some look-ahead
  const relevantStages = CORN_STAGES.filter((s) => s.gdd <= maxGdd * 1.5 + 200);

  const chartData = useMemo(
    () => ({
      labels: data.map((d) => format(parseISO(d.date), 'MMM d')),
      datasets: [
        {
          label: 'Cumulative GDD',
          data: data.map((d) => d.cumulative),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: data.length > 60 ? 0 : 2,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: 'Daily GDD',
          data: data.map((d) => d.gdd),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          yAxisID: 'y1',
          hidden: true,
        },
      ],
    }),
    [data]
  );

  const annotations: Record<string, object> = {};
  for (const stage of relevantStages) {
    annotations[`line_${stage.shortName}`] = {
      type: 'line',
      yMin: stage.gdd,
      yMax: stage.gdd,
      borderColor: 'rgba(107, 114, 128, 0.3)',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        display: true,
        content: `${stage.shortName} (${stage.gdd})`,
        position: 'start',
        font: { size: 10 },
        color: '#6b7280',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
    };
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'line',
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => {
            if (ctx.datasetIndex === 0) {
              const d = data[ctx.dataIndex];
              return `Daily: ${d.gdd.toFixed(1)} GDD`;
            }
            return '';
          },
        },
      },
      annotation: {
        annotations,
      },
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 8,
          font: { size: 10 },
        },
        grid: { display: false },
      },
      y: {
        title: {
          display: true,
          text: 'Cumulative GDD',
          font: { size: 11 },
        },
        ticks: { font: { size: 10 } },
        beginAtZero: true,
      },
      y1: {
        position: 'right',
        title: {
          display: true,
          text: 'Daily GDD',
          font: { size: 11 },
        },
        ticks: { font: { size: 10 } },
        beginAtZero: true,
        grid: { display: false },
      },
    },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-4">
      <h3 className="text-sm font-semibold text-corn-800 mb-3">GDD Accumulation</h3>
      <div style={{ height: '300px' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
