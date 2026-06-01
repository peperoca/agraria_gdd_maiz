import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Farm } from '../types';

interface FarmMapViewProps {
  farms: Farm[];
  currentFarmId: number | null;
  onSelectFarm: (id: number) => void;
  onBack: () => void;
}

export function FarmMapView({ farms, currentFarmId, onSelectFarm, onBack }: FarmMapViewProps) {
  const { t } = useTranslation();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const farmsWithCoords = farms.filter((f) => f.latitude !== null && f.longitude !== null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-34.738, -56.583],
      zoom: 7,
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

    // Add markers for each farm
    farmsWithCoords.forEach((farm) => {
      const isCurrent = farm.id === currentFarmId;
      const size = isCurrent ? 20 : 14;
      const color = isCurrent ? 'var(--blue)' : 'var(--orange)';
      const border = isCurrent ? 4 : 3;

      const icon = L.divIcon({
        html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:${border}px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        className: '',
      });

      const marker = L.marker([farm.latitude!, farm.longitude!], { icon }).addTo(map);

      // Permanent label with farm name
      marker.bindTooltip(farm.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -size / 2 - 2],
        className: 'farm-map-tooltip',
      });

      marker.on('click', () => {
        onSelectFarm(farm.id);
      });
    });

    // Fit bounds to show all farms
    if (farmsWithCoords.length > 1) {
      const bounds = L.latLngBounds(
        farmsWithCoords.map((f) => [f.latitude!, f.longitude!] as L.LatLngTuple)
      );
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (farmsWithCoords.length === 1) {
      map.setView([farmsWithCoords[0].latitude!, farmsWithCoords[0].longitude!], 12);
    }
    // else: keep default Uruguay center

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 pb-6">
      <div className="agraria-card">
        <div className="sec-label">{t('farmMap.title')}</div>

        {farmsWithCoords.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--tx3)' }}>
            {t('farmMap.noCoords')}
          </p>
        ) : (
          <p className="text-[10px] mb-2" style={{ color: 'var(--tx3)' }}>
            {t('farmMap.tapPin')}
          </p>
        )}

        <div
          ref={mapRef}
          className="rounded-[var(--r)] overflow-hidden"
          style={{ height: '65vh', width: '100%', background: 'var(--surface2)' }}
        />
      </div>

      <button
        onClick={onBack}
        className="w-full py-2 rounded-[var(--r)] text-xs font-medium"
        style={{ background: 'var(--surface2)', color: 'var(--tx2)', border: '1px solid var(--bdr)' }}
      >
        {t('nav.back')}
      </button>
    </div>
  );
}
