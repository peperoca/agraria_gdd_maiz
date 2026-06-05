import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Field } from '../types';
import { getCropConfig, getBaseCrop } from '../utils/cropConfig';
import { useWeatherData } from '../hooks/useWeatherData';

interface FieldMapViewProps {
  fields: Field[];
  farmLat?: number | null;
  farmLng?: number | null;
  onSelectField: (field: Field) => void;
  onBack: () => void;
}

const CROP_COLORS: Record<string, string> = {
  corn: '#f59e0b',      // amber
  soybean: '#10b981',   // emerald
  wheat: '#d97706',     // darker amber/wheat
  rapeseed: '#eab308',  // yellow
};

export function FieldMapView({ fields, farmLat, farmLng, onSelectField, onBack }: FieldMapViewProps) {
  const { t } = useTranslation();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const { fetchData } = useWeatherData();
  const [fieldStages, setFieldStages] = useState<Record<number, { stage: string; gdd: number; progress: number }>>({});

  // Fetch GDD for each field to determine current stage
  useEffect(() => {
    const fetchStages = async () => {
      const stages: Record<number, { stage: string; gdd: number; progress: number }> = {};
      for (const field of fields) {
        if (!field.sowingDate || !field.stationMac) continue;
        try {
          const config = getCropConfig(field.cropType ?? 'corn');
          const result = await fetchData(field.sowingDate, field.stationMac, config.baseTempF, config.upperCapF);
          const latestGdd = result.gdd.length > 0 ? result.gdd[result.gdd.length - 1] : null;
          const cumulative = latestGdd?.cumulative ?? 0;
          let currentStage = null;
          for (const s of config.stages) {
            if (cumulative >= s.gdd) currentStage = s;
            else break;
          }
          stages[field.id] = {
            stage: currentStage?.shortName ?? '—',
            gdd: Math.round(cumulative),
            progress: Math.min(100, Math.round((cumulative / config.maturityGdd) * 100)),
          };
        } catch {
          stages[field.id] = { stage: '—', gdd: 0, progress: 0 };
        }
      }
      setFieldStages(stages);
    };
    if (fields.length > 0) fetchStages();
  }, [fields, fetchData]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const center: [number, number] = farmLat && farmLng
      ? [farmLat, farmLng]
      : [-34.738, -56.583];

    const map = L.map(mapRef.current, {
      center,
      zoom: 14,
      zoomControl: true,
    });

    // Esri satellite tiles
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 18 }
    ).addTo(map);

    // Labels overlay
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, opacity: 0.7 }
    ).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw field polygons + labels
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing layers (except tile layers)
    map.eachLayer((layer) => {
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);
    const fieldsWithPolygon = fields.filter((f) => f.polygon && f.polygon.coordinates?.length > 0);

    fieldsWithPolygon.forEach((field) => {
      if (!field.polygon) return;

      const baseCrop = getBaseCrop(field.cropType ?? 'corn');
      const color = CROP_COLORS[baseCrop] || '#ff6b00';
      const stageInfo = fieldStages[field.id];

      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      const latLngs = field.polygon.coordinates[0].map(
        ([lng, lat]) => [lat, lng] as [number, number]
      );

      // Draw polygon
      const polygon = L.polygon(latLngs, {
        color,
        weight: 2.5,
        fillColor: color,
        fillOpacity: 0.25,
        opacity: 0.9,
      }).addTo(map);

      // Click polygon to select field
      polygon.on('click', () => onSelectField(field));

      // Extend bounds
      bounds.extend(polygon.getBounds());

      // Create label with field name, crop emoji, and stage
      const cropEmoji = baseCrop === 'corn' ? '🌽' : baseCrop === 'soybean' ? '🫘' : baseCrop === 'wheat' ? '🌾' : '🌻';
      const stageLine = stageInfo
        ? `<span style="font-weight:700;color:${color}">${stageInfo.stage}</span> · ${stageInfo.gdd} GDD`
        : '';

      const tooltipContent = `
        <div style="text-align:center;line-height:1.3;white-space:nowrap">
          <div style="font-weight:600;font-size:11px">${cropEmoji} ${field.name}</div>
          ${stageLine ? `<div style="font-size:10px;margin-top:1px">${stageLine}</div>` : ''}
        </div>
      `;

      // Permanent tooltip (always visible)
      polygon.bindTooltip(tooltipContent, {
        permanent: true,
        direction: 'center',
        className: 'field-map-tooltip',
      });
    });

    // Also add markers for fields without polygons (just a pin)
    const fieldsWithoutPolygon = fields.filter((f) => !f.polygon || !f.polygon.coordinates?.length);
    if (fieldsWithoutPolygon.length > 0 && farmLat && farmLng) {
      // Spread them around farm center as simple markers
      fieldsWithoutPolygon.forEach((field, i) => {
        const offset = 0.001 * (i + 1);
        const lat = farmLat + offset * Math.cos(i * 2.4);
        const lng = farmLng + offset * Math.sin(i * 2.4);
        const baseCrop = getBaseCrop(field.cropType ?? 'corn');
        const cropEmoji = baseCrop === 'corn' ? '🌽' : baseCrop === 'soybean' ? '🫘' : baseCrop === 'wheat' ? '🌾' : '🌻';
        const stageInfo = fieldStages[field.id];

        const icon = L.divIcon({
          html: `<div style="font-size:18px;text-align:center">${cropEmoji}</div>`,
          className: 'field-map-emoji-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.on('click', () => onSelectField(field));

        const tooltipContent = `
          <div style="text-align:center;line-height:1.3;white-space:nowrap">
            <div style="font-weight:600;font-size:11px">${field.name}</div>
            ${stageInfo ? `<div style="font-size:10px">${stageInfo.stage} · ${stageInfo.gdd} GDD</div>` : ''}
            <div style="font-size:9px;color:#888">No polygon</div>
          </div>
        `;
        marker.bindTooltip(tooltipContent, { permanent: true, direction: 'top', className: 'field-map-tooltip' });
        bounds.extend([lat, lng]);
      });
    }

    // Fit bounds if we have any fields
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [fields, fieldStages, farmLat, farmLng, onSelectField]);

  return (
    <div className="space-y-3 pb-4">
      <div className="agraria-card p-0 overflow-hidden" style={{ height: 'calc(100vh - 140px)', minHeight: '400px' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <button
        onClick={onBack}
        className="w-full py-2 rounded-[var(--r)] text-xs font-medium"
        style={{ background: 'var(--surface2)', color: 'var(--tx2)', border: '1px solid var(--bdr)' }}
      >
        {t('nav.back')}
      </button>
      <style>{`
        .field-map-tooltip {
          background: rgba(30, 30, 28, 0.88) !important;
          border: none !important;
          border-radius: 6px !important;
          color: #fff !important;
          padding: 4px 8px !important;
          font-family: inherit !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        }
        .field-map-tooltip::before {
          display: none !important;
        }
        .field-map-emoji-marker {
          background: none !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
