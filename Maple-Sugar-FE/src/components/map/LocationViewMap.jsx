import { Marker } from 'react-leaflet';
import { BaseMap } from './mapCore';
import { pinIcon } from './mapConstants';

export default function LocationViewMap({ location, height = 220 }) {
  return (
    <BaseMap
      center={[location.lat, location.lon]}
      zoom={17}
      height={height}
      scrollWheelZoom={false}
    >
      <Marker position={[location.lat, location.lon]} icon={pinIcon} />
    </BaseMap>
  );
}
