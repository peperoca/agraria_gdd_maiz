import { useState, useEffect, useMemo } from 'react';
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
import { getWeatherData, type WeatherReadingRaw } from '../utils/api';
import { getStationLocalDate, getStationLocalHour } from '../utils/stationTime';

ChartJS.register(
  CategoryScale, LinearScale, BarController, LineController,
  PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
);

interface WeatherStationCardProps {
  stationMac: string;
  stationName: string;
}

interface HourlyAvg {
  label: string;
  tempf: number | null;
  humidity: number | null;
  windspeedmph: number | null;
  solarradiation: number | null;
  dailyrainin: number | null;
}

function groupToHourly(raw: WeatherReadingRaw[]): HourlyAvg[] {
  const groups = new Map<string, WeatherReadingRaw[]>();

  for (const r of raw) {
    const date = getStationLocalDate(r.dateutc);
    const hour = getStationLocalHour(r.dateutc);
    const key = `${date}_${String(hour).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const keys = Array.from(groups.keys()).sort();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return keys.map((key) => {
    const readings = groups.get(key)!;
    const [dateStr, hourStr] = key.split('_');
    const hour = parseInt(hourStr, 10);
    const dayName = dayNames[new Date(dateStr + 'T12:00:00Z').getUTCDay()];
    const ampm = hour < 12 ? 'a' : 'p';
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const label = `${dayName} ${h12}${ampm}`;

    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v !== null && !isNaN(v));
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    };

    const maxVal = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v !== null && !isNaN(v));
      return valid.length > 0 ? Math.max(...valid) : null;
    };

    return {
      label,
      tempf: avg(readings.map((r) => r.tempf)),
      humidity: avg(readings.map((r) => r.humidity)),
      windspeedmph: avg(readings.map((r) => r.windspeedmph)),
      solarradiation: avg(readings.map((r) => r.solarradiation)),
      dailyrainin: maxVal(readings.map((r) => r.dailyrainin)),
    };
  });
}

function getLatestReading(raw: WeatherReadingRaw[]): WeatherReadingRaw | null {
  if (raw.length === 0) return null;
  return raw.reduce((latest, r) => r.dateutc > latest.dateutc ? r : latest, raw[0]);
}

function formatTime(dateutcMs: number): string {
  const date = getStationLocalDate(dateutcMs);
  const hour = getStationLocalHour(dateutcMs);
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const parts = date.split('-');
  return `${parts[1]}/${parts[2]} ${h12}:00 ${ampm}`;
}

export function WeatherStationCard({ stationMac, stationName }: WeatherStationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [raw, setRaw] = useState<WeatherReadingRaw[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stationMac) return;
    setLoading(true);
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    getWeatherData(stationMac, from)
      .then(setRaw)
      .catch(() => setRaw(null))
      .finally(() => setLoading(false));
  }, [stationMac]);

  const latest = raw ? getLatestReading(raw) : null;
  const hourly = useMemo(() => (raw ? groupToHourly(raw) : []), [raw]);

  const styles = getComputedStyle(document.documentElement);
  const orange = styles.getPropertyValue('--orange').trim() || '#d85a30';
  const blue = styles.getPropertyValue('--blue').trim() || '#185FA5';
  const tx3 = styles.getPropertyValue('--tx3').trim() || '#888780';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';
  const teal = '#1a9988';
  const yellow = '#eab308';
  const gray = '#9ca3af';

  const chartData = useMemo(() => ({
    labels: hourly.map((h) => h.label),
    datasets: [
      {
        type: 'line' as const,
        label: 'Temp (°F)',
        data: hourly.map((h) => h.tempf),
        borderColor: orange,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'yTemp',
        order: 1,
      },
      {
        type: 'line' as const,
        label: 'Humidity (%)',
        data: hourly.map((h) => h.humidity),
        borderColor: blue,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        yAxisID: 'yHumid',
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Wind (mph)',
        data: hourly.map((h) => h.windspeedmph),
        borderColor: gray,
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        yAxisID: 'yWind',
        order: 3,
      },
      {
        type: 'line' as const,
        label: 'Solar (W/m²)',
        data: hourly.map((h) => h.solarradiation),
        borderColor: yellow,
        backgroundColor: `${yellow}15`,
        borderWidth: 1,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        yAxisID: 'ySolar',
        order: 4,
      },
      {
        type: 'bar' as const,
        label: 'Rain (in)',
        data: hourly.map((h) => h.dailyrainin),
        backgroundColor: `${teal}60`,
        borderColor: teal,
        borderWidth: 1,
        borderRadius: 2,
        yAxisID: 'yRain',
        order: 5,
      },
    ],
  }), [hourly, orange, blue, gray, yellow, teal]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 8, padding: 6, font: { size: 9 }, color: tx3 },
      },
      tooltip: {
        backgroundColor: surface,
        titleColor: tx3,
        bodyColor: tx3,
        borderColor: tx3,
        borderWidth: 0.5,
        callbacks: {
          label(ctx) {
            const v = ctx.parsed.y;
            if (v === null || v === undefined) return '';
            const units = ['°F', '%', ' mph', ' W/m²', ' in'];
            return `${ctx.dataset.label}: ${v.toFixed(1)}${units[ctx.datasetIndex] || ''}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          font: { size: 8 },
          color: tx3,
          maxTicksLimit: 14,
          callback(_, idx) {
            const lbl = hourly[idx]?.label || '';
            return lbl.includes('12p') || lbl.includes('12a') ? lbl : '';
          },
        },
        grid: { display: false },
      },
      yTemp: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: '°F', font: { size: 9 }, color: orange },
        ticks: { font: { size: 8 }, color: orange },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      ySolar: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'W/m²', font: { size: 9 }, color: yellow },
        ticks: { font: { size: 8 }, color: yellow },
        grid: { display: false },
        min: 0,
      },
      yHumid: {
        type: 'linear',
        display: false,
        min: 0,
        max: 100,
      },
      yWind: {
        type: 'linear',
        display: false,
        min: 0,
      },
      yRain: {
        type: 'linear',
        display: false,
        min: 0,
      },
    },
  }), [hourly, tx3, surface, orange, yellow]);

  if (!stationMac || loading) {
    return (
      <div className="agraria-card" style={{ opacity: 0.6 }}>
        <div className="text-xs" style={{ color: 'var(--tx3)' }}>
          {loading ? 'Loading station data...' : 'No station assigned'}
        </div>
      </div>
    );
  }

  if (!latest) return null;

  return (
    <div
      className="agraria-card"
      style={{ cursor: 'pointer' }}
      onClick={() => setExpanded((prev) => !prev)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--tx)' }}>
            {stationName || stationMac}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--tx3)' }}>
            Last reading: {formatTime(latest.dateutc)}
          </div>
        </div>
        <div className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{ background: 'var(--surface2)', color: 'var(--tx3)' }}>
          {expanded ? 'Collapse' : '7-day chart'}
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-5 gap-1.5">
        <div className="text-center">
          <div className="text-[10px]" style={{ color: orange }}>Temp</div>
          <div className="text-sm font-bold" style={{ color: orange }}>
            {latest.tempf !== null ? `${latest.tempf.toFixed(0)}°` : '—'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: blue }}>Humid</div>
          <div className="text-sm font-bold" style={{ color: blue }}>
            {latest.humidity !== null ? `${latest.humidity.toFixed(0)}%` : '—'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: gray }}>Wind</div>
          <div className="text-sm font-bold" style={{ color: gray }}>
            {latest.windspeedmph !== null ? `${latest.windspeedmph.toFixed(1)}` : '—'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: yellow }}>Solar</div>
          <div className="text-sm font-bold" style={{ color: yellow }}>
            {latest.solarradiation !== null ? `${latest.solarradiation.toFixed(0)}` : '—'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: teal }}>Rain</div>
          <div className="text-sm font-bold" style={{ color: teal }}>
            {latest.dailyrainin !== null ? `${latest.dailyrainin.toFixed(2)}"` : '—'}
          </div>
        </div>
      </div>

      {/* Expanded chart */}
      {expanded && hourly.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid var(--bdr)' }}
          onClick={(e) => e.stopPropagation()}>
          <div className="sec-label" style={{ margin: '0 0 8px 0' }}>7-Day Weather</div>
          <div style={{ height: 260 }}>
            <Chart type="line" data={chartData as never} options={options as never} />
          </div>
        </div>
      )}
    </div>
  );
}
