import { useEffect, useMemo, useRef } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { groupByLocation, worstStatus } from '../../business/nodeMapStatus';
import { BaseMap } from './mapCore';
import { DEFAULT_CENTER } from './mapConstants';
import { NodePopupContent } from './NodePopupContent';
import { statusIcon } from './statusMarker';

// A freshly mounted map has not been measured yet; wait this long before moving it.
const SELECT_SETTLE_MS = 150;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function FitToMarkers({ groups }) {
  const map = useMap();
  const signature = groups.map((group) => group.key).join('|');
  useEffect(() => {
    if (groups.length === 0) return;
    map.fitBounds(groups.map((group) => group.position), { padding: [40, 40], maxZoom: 18, animate: false });
    // Refit only when the set of points changes, not on every status refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
}

function GroupMarker({ group, selected }) {
  const map = useMap();
  const ref = useRef(null);
  const [lat, lon] = group.position;
  const status = worstStatus(group.nodes);
  const icon = useMemo(
    () => statusIcon(status, group.nodes.length, selected),
    [status, group.nodes.length, selected],
  );
  useEffect(() => {
    if (!selected) return undefined;
    // A map that has only just mounted is not measured yet, so zooming at once
    // lands nowhere. Wait a tick, re-measure, then move.
    const timer = setTimeout(() => {
      map.invalidateSize();
      const target = Math.max(map.getZoom(), 17);
      if (prefersReducedMotion()) map.setView([lat, lon], target, { animate: false });
      else map.flyTo([lat, lon], target);
      ref.current?.openPopup();
    }, SELECT_SETTLE_MS);
    return () => clearTimeout(timer);
    // Primitives, not the array: the array is rebuilt on every data refresh,
    // which would re-fly the map and reopen a popup the user closed.
  }, [selected, map, lat, lon]);
  const label = group.nodes.map((node) => node.Node_Name).join(', ');
  return (
    <Marker ref={ref} position={group.position} icon={icon} title={label} alt={label} keyboard>
      <Popup>
        <NodePopupContent nodes={group.nodes} />
      </Popup>
    </Marker>
  );
}

/** Status-coded markers; nodes sharing a point share one marker and popup. */
export function FleetMap({ nodes, selectedId = null, height = 520, scrollWheelZoom = true }) {
  const groups = useMemo(() => groupByLocation(nodes), [nodes]);
  return (
    <BaseMap center={DEFAULT_CENTER} zoom={16} height={height} scrollWheelZoom={scrollWheelZoom}>
      <FitToMarkers groups={groups} />
      {groups.map((group) => (
        <GroupMarker
          key={group.key}
          group={group}
          selected={selectedId != null && group.nodes.some((node) => node.NodeID === selectedId)}
        />
      ))}
    </BaseMap>
  );
}
