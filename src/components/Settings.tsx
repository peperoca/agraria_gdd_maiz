import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { updateFarm, getStationsWithDistance } from '../utils/api';
import type { StationInfo } from '../utils/api';
import type { Farm } from '../types';

interface SettingsProps {
  onSaved: () => void;
  stations: StationInfo[];
  onLogout: () => void;
  currentFarm?: Farm | null;
  onDeleteFarm?: () => void;
}

export function Settings({ onLogout, currentFarm, onDeleteFarm, onSaved }: SettingsProps) {
  const { t } = useTranslation();
  const [editingFarm, setEditingFarm] = useState(false);
  const [farmName, setFarmName] = useState(currentFarm?.name ?? '');
  const [lat, setLat] = useState<number | null>(currentFarm?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(currentFarm?.longitude ?? null);
  const [saving, setSaving] = useState(false);

  // Station picker
  const [showStationPicker, setShowStationPicker] = useState(false);
  const [availableStations, setAvailableStations] = useState<StationInfo[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Init map when editing
  useEffect(() => {
    if (!editingFarm || !mapRef.current || mapInstanceRef.current) return;

    const defaultLat = lat ?? currentFarm?.latitude ?? -34.738;
    const defaultLng = lng ?? currentFarm?.longitude ?? -56.583;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 18 }
    ).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, opacity: 0.7 }
    ).addTo(map);

    const pinIcon = L.divIcon({
      html: '<div style="background:var(--orange);width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    });

    if (lat !== null && lng !== null) {
      markerRef.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLatLng();
        setLat(Math.round(pos.lat * 1000000) / 1000000);
        setLng(Math.round(pos.lng * 1000000) / 1000000);
      });
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const newLat = Math.round(e.latlng.lat * 1000000) / 1000000;
      const newLng = Math.round(e.latlng.lng * 1000000) / 1000000;
      setLat(newLat);
      setLng(newLng);

      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng, { icon: pinIcon, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLatLng();
          setLat(Math.round(pos.lat * 1000000) / 1000000);
          setLng(Math.round(pos.lng * 1000000) / 1000000);
        });
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFarm]);

  const handleSaveFarm = async () => {
    if (!currentFarm || !farmName.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = { name: farmName.trim() };
      if (lat !== null && lng !== null) {
        data.latitude = lat;
        data.longitude = lng;
      }
      await updateFarm(currentFarm.id, data);
      setEditingFarm(false);
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.failedUpdateFarm'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingFarm(false);
    setFarmName(currentFarm?.name ?? '');
    setLat(currentFarm?.latitude ?? null);
    setLng(currentFarm?.longitude ?? null);
    // Clean up map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    }
  };

  const handleOpenStationPicker = async () => {
    if (!currentFarm?.latitude || !currentFarm?.longitude) {
      alert(t('settings.setLocationFirst'));
      return;
    }
    setShowStationPicker(true);
    setLoadingStations(true);
    try {
      const stations = await getStationsWithDistance(currentFarm.latitude, currentFarm.longitude);
      setAvailableStations(stations);
    } catch {
      setAvailableStations([]);
    } finally {
      setLoadingStations(false);
    }
  };

  const handleSelectStation = async (stationId: number) => {
    if (!currentFarm) return;
    setSaving(true);
    try {
      await updateFarm(currentFarm.id, { stationId });
      setShowStationPicker(false);
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.failedUpdateStation'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Current Farm info */}
      {currentFarm && !editingFarm && (
        <div className="agraria-card">
          <div className="sec-label">{t('settings.farmSettings')}</div>
          <div className="space-y-1.5 text-xs" style={{ color: 'var(--tx2)' }}>
            <div className="flex justify-between">
              <span>{t('settings.nameLabel')}</span>
              <span style={{ color: 'var(--tx)' }}>{currentFarm.name}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('settings.stationLabel')}</span>
              <span style={{ color: 'var(--tx)' }}>
                {currentFarm.stationName || <span style={{ color: 'var(--tx3)' }}>{t('settings.notAssigned')}</span>}
                {currentFarm.stationDistanceKm != null && (
                  <span
                    className="ml-1"
                    style={{ color: currentFarm.stationDistanceKm > 20 ? '#b45309' : 'var(--tx3)' }}
                  >
                    ({currentFarm.stationDistanceKm.toFixed(0)} km)
                  </span>
                )}
              </span>
            </div>
            {currentFarm.latitude !== null && currentFarm.longitude !== null ? (
              <div className="flex justify-between">
                <span>{t('settings.locationLabel')}</span>
                <span style={{ color: 'var(--tx)' }}>
                  {currentFarm.latitude.toFixed(4)}, {currentFarm.longitude.toFixed(4)}
                </span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span>{t('settings.locationLabel')}</span>
                <span style={{ color: '#b45309' }}>{t('settings.locationNotSet')}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setEditingFarm(true)}
              className="text-[11px] px-3 py-1.5 rounded-[var(--r)] font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--tx)' }}
            >
              {t('settings.editFarm')}
            </button>
            <button
              onClick={handleOpenStationPicker}
              className="text-[11px] px-3 py-1.5 rounded-[var(--r)] font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--tx)' }}
            >
              {t('settings.changeStation')}
            </button>
            {onDeleteFarm && (
              <button
                onClick={onDeleteFarm}
                className="text-[11px] px-3 py-1.5 rounded-[var(--r)] border ml-auto"
                style={{ borderColor: 'var(--dt)', color: 'var(--dt)', background: 'transparent' }}
              >
                {t('settings.delete')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit farm form */}
      {currentFarm && editingFarm && (
        <div className="agraria-card">
          <div className="sec-label">{t('settings.editFarm')}</div>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('settings.farmNameLabel')}</label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                className="agraria-input"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--tx2)' }}>
                {t('settings.locationLabel')} <span style={{ color: 'var(--tx3)' }}>{t('settings.locationHint')}</span>
              </label>
              <div
                ref={mapRef}
                className="rounded-[var(--r)] border overflow-hidden"
                style={{ height: '220px', borderColor: 'var(--bdr2)' }}
              />
              {lat !== null && lng !== null && (
                <div className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>
                  {lat.toFixed(4)}, {lng.toFixed(4)}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 py-2 px-3 rounded-[var(--r)] text-xs font-medium"
                style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
              >
                {t('settings.cancel')}
              </button>
              <button
                onClick={handleSaveFarm}
                disabled={saving || !farmName.trim()}
                className="agraria-btn-primary flex-1 text-xs"
              >
                {saving ? t('settings.saving') : t('settings.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Station picker modal */}
      {showStationPicker && (
        <div className="agraria-card">
          <div className="flex items-center justify-between mb-2">
            <div className="sec-label mb-0">{t('settings.selectWeatherStation')}</div>
            <button
              onClick={() => setShowStationPicker(false)}
              className="text-[11px] px-2 py-1 rounded"
              style={{ color: 'var(--tx3)' }}
            >
              {t('settings.cancel')}
            </button>
          </div>
          <p className="text-[10px] mb-2" style={{ color: 'var(--tx3)' }}>
            {t('settings.stationSortNote')}
          </p>
          {loadingStations ? (
            <div className="text-xs py-4 text-center" style={{ color: 'var(--tx3)' }}>{t('settings.loadingStations')}</div>
          ) : availableStations.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: 'var(--tx3)' }}>{t('settings.noStationsAvailable')}</div>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {availableStations.map((s) => {
                const isCurrent = currentFarm?.stationMac === s.mac;
                const isFar = s.distanceKm != null && s.distanceKm > 20;
                return (
                  <button
                    key={s.mac}
                    onClick={() => !isCurrent && s.id && handleSelectStation(s.id)}
                    disabled={isCurrent || saving}
                    className="w-full text-left px-3 py-2 rounded-[var(--r)] flex items-center justify-between"
                    style={{
                      background: isCurrent ? 'var(--surface2)' : 'var(--bg)',
                      border: isCurrent ? '1.5px solid var(--blue)' : '1px solid var(--bdr)',
                      opacity: isCurrent ? 1 : undefined,
                    }}
                  >
                    <div>
                      <div className="text-xs font-medium" style={{ color: 'var(--tx)' }}>
                        {s.name}
                        {isCurrent && (
                          <span className="ml-1.5 text-[10px] font-normal" style={{ color: 'var(--blue)' }}>
                            {t('settings.currentStation')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--tx3)' }}>
                        {s.latitude.toFixed(3)}, {s.longitude.toFixed(3)}
                      </div>
                    </div>
                    {s.distanceKm != null && (
                      <div
                        className="text-[11px] font-medium shrink-0 ml-2"
                        style={{ color: isFar ? '#b45309' : 'var(--tx3)' }}
                      >
                        {s.distanceKm.toFixed(0)} km
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Account */}
      <div className="agraria-card space-y-3">
        <div className="sec-label">{t('settings.account')}</div>
        <button
          onClick={onLogout}
          className="agraria-btn-secondary w-full flex items-center justify-center gap-2"
        >
          {t('settings.signOut')}
        </button>
        <p className="text-[11px]" style={{ color: 'var(--tx3)' }}>
          {t('settings.accountNote')}
        </p>
      </div>
    </div>
  );
}
