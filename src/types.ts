export interface GeoPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number | null;
  altitude: number | null;
}

export interface SessionStats {
  distance: number; // in meters
  maxSpeed: number; // in m/s
  avgSpeed: number; // in m/s
  totalTime: number; // in ms
  elevationGain: number; // in meters
}
