import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Emoji pins as divIcons: no image files to bundle (Leaflet's default marker images break under bundlers).
const pin = (emoji, cls = '') =>
  L.divIcon({ className: `map-pin ${cls}`, html: `<span>${emoji}</span>`, iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] });
const icons = { home: pin('📍', 'pin-home'), shop: pin('🍽️', 'pin-shop'), rider: pin('🛵', 'pin-rider') };

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom ?? map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1]]);
  return null;
}

function FitTo({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickToPin({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Click anywhere (or drag the pin) to choose a point. */
export function MapPicker({ value, onChange, shops = [], height = 280 }) {
  const center = [value.lat, value.lng];
  return (
    <MapContainer center={center} zoom={14} style={{ height }} className="map" scrollWheelZoom>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <Recenter center={center} />
      <ClickToPin onPick={onChange} />
      {shops.map((s) => (
        <Marker key={s._id} position={[s.location.lat, s.location.lng]} icon={icons.shop}>
          <Popup>{s.name}</Popup>
        </Marker>
      ))}
      <Marker
        position={center}
        icon={icons.home}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const p = e.target.getLatLng();
            onChange({ lat: p.lat, lng: p.lng });
          },
        }}
      />
    </MapContainer>
  );
}

/** Live tracking map: restaurant, delivery address and (when out for delivery) the rider. */
export function TrackMap({ restaurant, destination, rider, height = 320 }) {
  const shop = [restaurant.lat, restaurant.lng];
  const home = [destination.lat, destination.lng];
  const bike = rider ? [rider.lat, rider.lng] : null;
  const points = [shop, home, ...(bike ? [bike] : [])];
  return (
    <MapContainer center={home} zoom={14} style={{ height }} className="map" scrollWheelZoom={false}>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <FitTo points={points} />
      <Polyline positions={bike ? [bike, home] : [shop, home]} pathOptions={{ color: '#ea580c', weight: 4, dashArray: '8 8' }} />
      <Marker position={shop} icon={icons.shop}>
        <Popup>{restaurant.name}</Popup>
      </Marker>
      <Marker position={home} icon={icons.home}>
        <Popup>Delivery address</Popup>
      </Marker>
      {bike && (
        <Marker position={bike} icon={icons.rider}>
          <Popup>Your delivery partner</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
