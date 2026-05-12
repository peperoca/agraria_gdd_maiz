import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface FarmFormProps {
  initialName?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  onSubmit: (data: { name: string; latitude?: number; longitude?: number }) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function FarmForm({ initialName, initialLat, initialLng, onSubmit, onCancel, isEditing }: FarmFormProps) {
  const [name, setName] = useState(initialName ?? '');
  const [lat, setLat] = useState<number | null>(initialLat ?? null);
  const [lng, setLng] = useState<number | null>(initialLng ?? null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const isValid = name.trim().length > 0;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultLat = lat ?? -34.738;
    const defaultLng = lng ?? -56.583;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 12,
      zoomControl: true,
    });

    // Esri satellite tiles
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 18,
      }
    ).addTo(map);

    // Labels overlay
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, opacity: 0.7 }
    ).addTo(map);

    // Custom pin icon
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
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const data: { name: string; latitude?: number; longitude?: number } = { name: name.trim() };
    if (lat !== null && lng !== null) {
      data.latitude = lat;
      data.longitude = lng;
    }
    onSubmit(data);
  };

  return (
    <div className="agraria-card">
      <div className="sec-label">{isEditing ? 'Edit Farm' : 'New Farm'}</div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--tx2)' }}>Farm Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Estancia Santa Rosa"
            className="agraria-input"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--tx2)' }}>
            Location <span style={{ color: 'var(--tx3)' }}>(tap map to place pin)</span>
          </label>
          <div
            ref={mapRef}
            className="rounded-[var(--r)] border overflow-hidden"
            style={{ height: '250px', borderColor: 'var(--bdr2)' }}
          />
          {lat !== null && lng !== null && (
            <div className="text-[11px] mt-1" style={{ color: 'var(--tx3)' }}>
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-[var(--r)] text-sm font-medium cursor-pointer border-none"
            style={{ background: 'var(--surface2)', color: 'var(--tx2)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="agraria-btn-primary flex-1"
          >
            {isEditing ? 'Save Changes' : 'Create Farm'}
          </button>
        </div>
      </form>
    </div>
  );
}
