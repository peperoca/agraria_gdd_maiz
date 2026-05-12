import { useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { FieldPolygon } from '../types';

interface PolygonMapProps {
  centerLat?: number;
  centerLng?: number;
  polygon?: FieldPolygon | null;
  onChange: (polygon: FieldPolygon | null) => void;
}

export function PolygonMap({ centerLat, centerLng, polygon, onChange }: PolygonMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const lat = centerLat ?? -34.738;
    const lng = centerLng ?? -56.583;

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: polygon ? 15 : 14,
      zoomControl: true,
    });

    // Esri satellite tiles
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    ).addTo(map);

    // Labels overlay
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 0.7 }
    ).addTo(map);

    // Feature group for drawn polygons
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Load existing polygon
    if (polygon && polygon.coordinates && polygon.coordinates.length > 0) {
      const coords = polygon.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
      const layer = L.polygon(coords, {
        color: '#ff6b00',
        weight: 2,
        fillOpacity: 0.2,
        fillColor: '#ff6b00',
      });
      drawnItems.addLayer(layer);
      map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    }

    // Draw controls — only polygon tool
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: {
            color: '#ff6b00',
            weight: 2,
            fillOpacity: 0.2,
            fillColor: '#ff6b00',
          },
        },
        polyline: false,
        circle: false,
        rectangle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Handle draw events
    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);

      const latlngs = (event.layer as L.Polygon).getLatLngs()[0] as L.LatLng[];
      const geoCoords = latlngs.map((ll) => [ll.lng, ll.lat]);
      // Close the ring
      if (geoCoords.length > 0) {
        geoCoords.push(geoCoords[0]);
      }
      onChange({ type: 'Polygon', coordinates: [geoCoords] });
    });

    map.on(L.Draw.Event.EDITED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Edited;
      const layers = event.layers;
      layers.eachLayer((layer) => {
        const latlngs = (layer as L.Polygon).getLatLngs()[0] as L.LatLng[];
        const geoCoords = latlngs.map((ll) => [ll.lng, ll.lat]);
        if (geoCoords.length > 0) geoCoords.push(geoCoords[0]);
        onChange({ type: 'Polygon', coordinates: [geoCoords] });
      });
    });

    map.on(L.Draw.Event.DELETED, () => {
      onChange(null);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs" style={{ color: 'var(--tx2)' }}>
        Field Boundary <span style={{ color: 'var(--tx3)' }}>(draw polygon on map)</span>
      </label>
      <div
        ref={mapRef}
        className="rounded-[var(--r)] border overflow-hidden"
        style={{ height: '280px', borderColor: 'var(--bdr2)' }}
      />
    </div>
  );
}
