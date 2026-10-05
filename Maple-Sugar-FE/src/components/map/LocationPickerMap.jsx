import { useEffect, useMemo } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import { BaseMap } from './mapCore';
import { DEFAULT_CENTER, pinIcon } from './mapConstants';

function ClickToPlace({ onChange }) {
  useMapEvents({
    click: (event) => onChange({ lat: event.latlng.lat, lon: event.latlng.lng }),
  });
  return null;
}

// Recenters when the value is set from outside the map (Use my location, or
// opening an existing node), but not while the pin is being dragged or clicked.
function Follow({ value }) {
  const map = useMap();
  useEffect(() => {
    if (!value) return;
    const target = [value.lat, value.lon];
    if (!map.getBounds().contains(target)) map.setView(target, Math.max(map.getZoom(), 17));
  }, [map, value]);
  return null;
}

export default function LocationPickerMap({ value, onChange, height = 280 }) {
  const markerHandlers = useMemo(
    () => ({
      dragend: (event) => {
        const { lat, lng } = event.target.getLatLng();
        onChange({ lat, lon: lng });
      },
    }),
    [onChange],
  );

  return (
    <BaseMap
      center={value ? [value.lat, value.lon] : DEFAULT_CENTER}
      zoom={value ? 17 : 15}
      height={height}
    >
      <ClickToPlace onChange={onChange} />
      <Follow value={value} />
      {value ? (
        <Marker position={[value.lat, value.lon]} icon={pinIcon} draggable eventHandlers={markerHandlers} />
      ) : null}
    </BaseMap>
  );
}
