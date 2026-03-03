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
  elevationLoss: number; // in meters
  currentSlope: number; // in percentage
  maxAltitude: number; // in meters
  maxSlope: number; // in percentage
  minSlope: number; // in percentage
  falls35g: number;
  falls20g: number;
  falls10g: number;
}
