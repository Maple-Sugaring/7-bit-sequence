import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/*
 * WCAG 2.2 SC 4.1.2 Name, Role, Value (V12)
 *
 * Leaflet makes its container <div> focusable (tabindex="0") so the map can be
 * panned with the arrow keys, but gives it no role or name. Screen readers
 * announce an unnamed group. This names it as a landmark region:
 *
 *   "Fleet map, map region" + the description (keyboard help + alternative)
 *
 * Usage — place inside <MapContainer>:
 *   <MapContainer ...>
 *     <AccessibleMapLabel
 *       label="Fleet map"
 *       description="Use arrow keys to pan and plus or minus to zoom. Every tree is also listed under Your trees."
 *     />
 *     <TileLayer ... />
 *   </MapContainer>
 *
 * Keeps tabindex: removing it would break Leaflet's keyboard panning (2.1.1).
 */
export function AccessibleMapLabel({ label, description }) {
  const map = useMap();

  useEffect(() => {
    const el = map.getContainer();
    const descId = `${el.id || 'leaflet-map'}-desc-${Math.random().toString(36).slice(2, 8)}`;

    el.setAttribute('role', 'region');
    el.setAttribute('aria-roledescription', 'map');
    el.setAttribute('aria-label', label);

    let desc;
    if (description) {
      desc = document.createElement('p');
      desc.id = descId;
      desc.textContent = description;
      // visually hidden, still read by screen readers
      Object.assign(desc.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        margin: '-1px',
        padding: '0',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: '0',
      });
      el.insertAdjacentElement('afterend', desc);
      el.setAttribute('aria-describedby', descId);
    }

    return () => {
      ['role', 'aria-roledescription', 'aria-label', 'aria-describedby'].forEach((a) =>
        el.removeAttribute(a),
      );
      desc?.remove();
    };
  }, [map, label, description]);

  return null;
}