import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import type { NdviReading, FieldPolygon } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'https://www.valleychaco.com.py/gdd-api/api';

function getToken(): string | null {
  return localStorage.getItem('corn-gdd-token');
}

interface NdviImageViewProps {
  fieldId: number;
  fieldName: string;
  ndviData: NdviReading[];
  initialDate?: string;
  polygon?: FieldPolygon | null;
  onBack: () => void;
}

export function NdviImageView({ fieldId, fieldName, ndviData, initialDate, polygon, onBack }: NdviImageViewProps) {
  const { t } = useTranslation();
  const sorted = [...ndviData].sort((a, b) => a.date.localeCompare(b.date));
  const [selectedDate, setSelectedDate] = useState(initialDate || (sorted.length > 0 ? sorted[sorted.length - 1].date : ''));
  const [trueColorUrl, setTrueColorUrl] = useState<string | null>(null);
  const [ndviUrl, setNdviUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedReading = sorted.find((r) => r.date === selectedDate);

  // Compute SVG polygon overlay (maps GeoJSON coords to % of image using same bbox+padding as backend)
  const svgOverlay = useMemo(() => {
    if (!polygon?.coordinates?.[0]) return null;
    const coords = polygon.coordinates[0]; // [lng, lat][]
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    // 10% padding (same as backend ndvi-image.php)
    const lngPad = (maxLng - minLng) * 0.1;
    const latPad = (maxLat - minLat) * 0.1;
    const bboxMinLng = minLng - lngPad, bboxMaxLng = maxLng + lngPad;
    const bboxMinLat = minLat - latPad, bboxMaxLat = maxLat + latPad;
    const bboxW = bboxMaxLng - bboxMinLng;
    const bboxH = bboxMaxLat - bboxMinLat;
    if (bboxW === 0 || bboxH === 0) return null;

    // Build SVG path in percentage coordinates
    const points = coords.map(([lng, lat]) => {
      const xPct = ((lng - bboxMinLng) / bboxW) * 100;
      const yPct = ((bboxMaxLat - lat) / bboxH) * 100;
      return [xPct, yPct] as [number, number];
    });

    // Build SVG path string using percentages mapped to a 1000x1000 viewBox for precision
    const scale = 10; // multiply pct by 10 to get 0-1000 range
    const pathD = points.map(([x, y], i) =>
      `${i === 0 ? 'M' : 'L'}${(x * scale).toFixed(1)},${(y * scale).toFixed(1)}`
    ).join(' ') + ' Z';

    return pathD;
  }, [polygon]);

  useEffect(() => {
    if (!selectedDate) return;

    setLoading(true);
    setError(null);

    const token = getToken();

    // Build URLs for fetch with auth header
    const tcUrl = `${API_BASE}/ndvi-image.php?field_id=${fieldId}&date=${selectedDate}&type=truecolor`;
    const ndUrl = `${API_BASE}/ndvi-image.php?field_id=${fieldId}&date=${selectedDate}&type=ndvi`;

    // Fetch both images with auth header
    Promise.all([
      fetch(tcUrl, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
        if (!r.ok) throw new Error('Failed to load true color image');
        return r.blob();
      }),
      fetch(ndUrl, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
        if (!r.ok) throw new Error('Failed to load NDVI image');
        return r.blob();
      }),
    ])
      .then(([tcBlob, ndBlob]) => {
        // Revoke old URLs
        if (trueColorUrl) URL.revokeObjectURL(trueColorUrl);
        if (ndviUrl) URL.revokeObjectURL(ndviUrl);

        setTrueColorUrl(URL.createObjectURL(tcBlob));
        setNdviUrl(URL.createObjectURL(ndBlob));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, fieldId]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (trueColorUrl) URL.revokeObjectURL(trueColorUrl);
      if (ndviUrl) URL.revokeObjectURL(ndviUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIdx = sorted.findIndex((r) => r.date === selectedDate);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx < sorted.length - 1;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="agraria-card">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onBack}
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: 'var(--blue)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('ndviImage.backTo', { name: fieldName })}
          </button>
        </div>
        <div className="sec-label">{t('ndviImage.title')}</div>

        {/* Date navigation */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            onClick={() => canPrev && setSelectedDate(sorted[currentIdx - 1].date)}
            disabled={!canPrev}
            className="p-1.5 rounded-[var(--r)] border"
            style={{
              borderColor: 'var(--bdr2)',
              color: canPrev ? 'var(--tx)' : 'var(--tx3)',
              opacity: canPrev ? 1 : 0.4,
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 text-xs px-2.5 py-1.5 rounded-[var(--r)] border text-center font-medium"
            style={{ background: 'var(--surface)', color: 'var(--tx)', borderColor: 'var(--bdr2)' }}
          >
            {sorted.map((r) => (
              <option key={r.date} value={r.date}>
                {format(parseISO(r.date), 'MMM d, yyyy')} — {t('ndviImage.ndvi')}: {r.ndviMean.toFixed(3)}
              </option>
            ))}
          </select>

          <button
            onClick={() => canNext && setSelectedDate(sorted[currentIdx + 1].date)}
            disabled={!canNext}
            className="p-1.5 rounded-[var(--r)] border"
            style={{
              borderColor: 'var(--bdr2)',
              color: canNext ? 'var(--tx)' : 'var(--tx3)',
              opacity: canNext ? 1 : 0.4,
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Reading info */}
        {selectedReading && (
          <div className="agraria-info-row grid grid-cols-3 gap-2 mt-3">
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('ndviImage.ndvi')}</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                {selectedReading.ndviMean.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('ndviImage.kc')}</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                {selectedReading.kc.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>{t('ndviImage.cloud')}</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                {selectedReading.cloudPct !== null ? `${selectedReading.cloudPct.toFixed(0)}%` : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Images */}
      {loading && (
        <div className="agraria-card text-center py-8">
          <div className="text-2xl mb-2">🛰</div>
          <p className="text-xs" style={{ color: 'var(--tx3)' }}>{t('ndviImage.loadingSatellite')}</p>
        </div>
      )}

      {error && (
        <div className="agraria-card">
          <div className="text-xs p-2.5 rounded-[var(--r)]" style={{ background: 'var(--db)', color: 'var(--dt)' }}>
            {error}
          </div>
        </div>
      )}

      {!loading && trueColorUrl && (
        <div className="agraria-card">
          <div className="sec-label">{t('ndviImage.trueColor')}</div>
          <div className="relative">
            <img
              src={trueColorUrl}
              alt="True color satellite"
              className="w-full rounded-[var(--r)] border"
              style={{ borderColor: 'var(--bdr)' }}
            />
            {svgOverlay && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path
                  d={svgOverlay}
                  fill="rgba(255, 51, 0, 0.08)"
                  stroke="#ff3300"
                  strokeWidth="3"
                  strokeDasharray="8,4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--tx3)' }}>
            {t('ndviImage.trueColorCaption', { date: format(parseISO(selectedDate), 'MMMM d, yyyy') })}
          </p>
        </div>
      )}

      {!loading && ndviUrl && (
        <div className="agraria-card">
          <div className="sec-label">{t('ndviImage.ndviVegetation')}</div>
          <div className="relative">
            <img
              src={ndviUrl}
              alt="NDVI visualization"
              className="w-full rounded-[var(--r)] border"
              style={{ borderColor: 'var(--bdr)' }}
            />
            {svgOverlay && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path
                  d={svgOverlay}
                  fill="rgba(255, 51, 0, 0.08)"
                  stroke="#ff3300"
                  strokeWidth="3"
                  strokeDasharray="8,4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>{t('ndviImage.legendLow')}</span>
            <div className="flex-1 h-2.5 rounded-full" style={{
              background: 'linear-gradient(to right, #804d1a, #cca000, #80cc00, #2d8a4e, #0d6633)',
            }} />
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>{t('ndviImage.legendHigh')}</span>
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>-0.2</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.0</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.3</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.5</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.8+</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>
            {t('ndviImage.ndviExplanation')}
          </p>
        </div>
      )}
    </div>
  );
}
