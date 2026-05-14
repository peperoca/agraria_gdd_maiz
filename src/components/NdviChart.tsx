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
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import type { NdviReading } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface NdviChartProps {
  data: NdviReading[];
  onDateClick?: (date: string) => void;
}

export function NdviChart({ data, onDateClick }: NdviChartProps) {
  const styles = getComputedStyle(document.documentElement);
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const green = '#2d8a4e';
  const orange = styles.getPropertyValue('--orange').trim() || '#D97706';

  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);

  const chartData = useMemo(() => ({
    labels: sorted.map((d) => format(parseISO(d.date), 'MMM d')),
    datasets: [
      {
        label: 'NDVI',
        data: sorted.map((d) => d.ndviMean),
        borderColor: green,
        backgroundColor: `${green}30`,
        fill: true,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: 'yNdvi',
      },
      {
        label: 'Kc',
        data: sorted.map((d) => d.kc),
        borderColor: orange,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 3],
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        yAxisID: 'yKc',
      },
    ],
  }), [sorted, green, orange]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    onClick: (_event, elements) => {
      if (onDateClick && elements.length > 0) {
        const idx = elements[0].index;
        if (idx >= 0 && idx < sorted.length) {
          onDateClick(sorted[idx].date);
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { usePointStyle: true, font: { size: 11 }, color: tx3 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label}: ${val.toFixed(3)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { size: 10 }, color: tx3 },
        grid: { display: false },
      },
      yNdvi: {
        position: 'left',
        title: { display: true, text: 'NDVI', font: { size: 10 }, color: green },
        ticks: { font: { size: 9 }, color: green },
        grid: { color: `${tx3}15` },
        min: 0,
        max: 1,
      },
      yKc: {
        position: 'right',
        title: { display: true, text: 'Kc', font: { size: 10 }, color: orange },
        ticks: { font: { size: 9 }, color: orange },
        grid: { display: false },
        min: 0,
        max: 1.5,
      },
    },
  };

  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  return (
    <div className="agraria-card">
      <div className="sec-label">Vegetation Index (NDVI) & Crop Coefficient (Kc)</div>
      {latest && (
        <div className="agraria-info-row grid grid-cols-3 gap-2 mb-3">
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>NDVI</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {latest.ndviMean.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Kc</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {latest.kc.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Date</div>
            <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
              {format(parseISO(latest.date), 'MMM d')}
            </div>
          </div>
        </div>
      )}
      <div style={{ height: '240px', cursor: onDateClick ? 'pointer' : undefined }}>
        <Line data={chartData} options={options} />
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--tx3)' }}>
        Sentinel-2 NDVI (green area). Kc = 1.25 × NDVI + 0.20 (Glenn et al.). Cloud-filtered scenes only.
        {onDateClick && (
          <span style={{ color: 'var(--blue)' }}> Tap a point to view satellite imagery 🛰</span>
        )}
      </p>
    </div>
  );
}
