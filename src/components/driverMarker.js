// driverMarker.js
// Drop this into your driver/passenger trip page (wherever the Leaflet map lives).
// Replaces the plain pin with the tricycle icon, and rotates it + a small arrow
// to show the direction the driver is heading.

import L from "leaflet";

// Path to the tricycle image — put driver-marker-64.png in your project's
// /public folder (e.g. /public/icons/driver-marker-64.png) and adjust this path.
const TRIKE_ICON_URL = "/icons/driver-marker-64.png";

/**
 * Calculates the compass bearing (0-360°) from point 1 to point 2.
 * Call this every time you get a new GPS fix, using the previous
 * and current lat/lng, to know which way the tricycle is heading.
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Builds a Leaflet divIcon showing the tricycle image plus a small
 * triangular arrow above it that points in the direction of travel.
 * The whole icon rotates together so the arrow always points "forward".
 *
 * @param {number} bearing - direction in degrees (0 = north, 90 = east, etc.)
 */
export function createDriverIcon(bearing = 0) {
  const html = `
    <div class="driver-marker-wrapper" style="transform: rotate(${bearing}deg);">
      <div class="driver-marker-arrow"></div>
      <img
        src="${TRIKE_ICON_URL}"
        class="driver-marker-image"
        style="transform: rotate(${-bearing}deg);"
      />
    </div>
  `;

  return L.divIcon({
    html,
    className: "driver-marker-container", // keep empty in CSS, just a hook
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

/**
 * Call this whenever a new driver position comes in (e.g. from your
 * Supabase realtime subscription). It moves the marker and updates
 * the rotation based on where it moved from.
 *
 * markerRef: the Leaflet marker instance for this driver
 * prevPos: { lat, lng } from the last update (or null on first fix)
 * newPos: { lat, lng } just received
 */
export function updateDriverMarker(markerRef, prevPos, newPos) {
  if (!markerRef) return;

  markerRef.setLatLng([newPos.lat, newPos.lng]);

  if (prevPos) {
    const bearing = calculateBearing(
      prevPos.lat,
      prevPos.lng,
      newPos.lat,
      newPos.lng
    );
    markerRef.setIcon(createDriverIcon(bearing));
  }
}

/*
CSS to add once (global stylesheet or a <style> tag):

.driver-marker-wrapper {
  width: 48px;
  height: 48px;
  position: relative;
  transition: transform 0.3s linear;
}

.driver-marker-image {
  width: 48px;
  height: 48px;
  display: block;
}

.driver-marker-arrow {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 12px solid #0a7d34; // matches the tricycle icon's green ring
  z-index: 2;
}

Usage in your trip page component (example):

  const [prevPos, setPrevPos] = useState(null);
  const markerRef = useRef(null);

  // when a new position arrives from Supabase realtime:
  updateDriverMarker(markerRef.current, prevPos, newPos);
  setPrevPos(newPos);

  // initial marker creation:
  <Marker
    position={[driverLat, driverLng]}
    icon={createDriverIcon(0)}
    ref={markerRef}
  />
*/
