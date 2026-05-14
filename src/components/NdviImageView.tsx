import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import type { NdviReading } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'https://www.valleychaco.com.py/gdd-api/api';

function getToken(): string | null {
  return localStorage.getItem('corn-gdd-token');
}

interface NdviImageViewProps {
  fieldId: number;
  fieldName: string;
  ndviData: NdviReading[];
  initialDate?: string;
  onBack: () => void;
}

export function NdviImageView({ fieldId, fieldName, ndviData, initialDate, onBack }: NdviImageViewProps) {
  const sorted = [...ndviData].sort((a, b) => a.date.localeCompare(b.date));
  const [selectedDate, setSelectedDate] = useState(initialDate || (sorted.length > 0 ? sorted[sorted.length - 1].date : ''));
  const [trueColorUrl, setTrueColorUrl] = useState<string | null>(null);
  const [ndviUrl, setNdviUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedReading = sorted.find((r) => r.date === selectedDate);

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
            Back to {fieldName}
          </button>
        </div>
        <div className="sec-label">Satellite Imagery</div>

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
                {format(parseISO(r.date), 'MMM d, yyyy')} — NDVI: {r.ndviMean.toFixed(3)}
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
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>NDVI</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                {selectedReading.ndviMean.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Kc</div>
              <div className="text-base font-semibold" style={{ color: 'var(--it)' }}>
                {selectedReading.kc.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[11px] opacity-75" style={{ color: 'var(--it)' }}>Cloud</div>
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
          <p className="text-xs" style={{ color: 'var(--tx3)' }}>Loading satellite imagery...</p>
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
          <div className="sec-label">True Color</div>
          <img
            src={trueColorUrl}
            alt="True color satellite"
            className="w-full rounded-[var(--r)] border"
            style={{ borderColor: 'var(--bdr)' }}
          />
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--tx3)' }}>
            Sentinel-2 RGB (B4/B3/B2) — {format(parseISO(selectedDate), 'MMMM d, yyyy')}
          </p>
        </div>
      )}

      {!loading && ndviUrl && (
        <div className="agraria-card">
          <div className="sec-label">NDVI Vegetation Index</div>
          <img
            src={ndviUrl}
            alt="NDVI visualization"
            className="w-full rounded-[var(--r)] border"
            style={{ borderColor: 'var(--bdr)' }}
          />
          {/* Legend */}
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>Low</span>
            <div className="flex-1 h-2.5 rounded-full" style={{
              background: 'linear-gradient(to right, #804d1a, #cca000, #80cc00, #2d8a4e, #0d6633)',
            }} />
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>High</span>
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>-0.2</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.0</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.3</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.5</span>
            <span className="text-[9px]" style={{ color: 'var(--tx3)' }}>0.8+</span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>
            Green = healthy vegetation. Gray = clouds. Brown = bare soil.
          </p>
        </div>
      )}
    </div>
  );
}
