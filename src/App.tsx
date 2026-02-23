/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, Marker, CircleMarker } from 'react-leaflet';
import { 
  Play, 
  Square, 
  Navigation, 
  TrendingUp, 
  Zap, 
  Map as MapIcon, 
  History, 
  Settings,
  Mountain,
  Timer,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import { GeoPoint, SessionStats } from './types';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper to calculate distance between two points (Haversine formula)
const calculateDistance = (p1: { lat: number, lng: number }, p2: { lat: number, lng: number }) => {
  const R = 6371e3; // metres
  const φ1 = p1.lat * Math.PI / 180;
  const φ2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [route, setRoute] = useState<GeoPoint[]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    distance: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    totalTime: 0,
    elevationGain: 0
  });
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const watchId = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // Start/Stop Tracking
  const toggleTracking = useCallback(() => {
    if (isTracking) {
      // Stop
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      setIsTracking(false);
    } else {
      // Start
      setIsTracking(true);
      setStartTime(Date.now());
      setRoute([]);
      setStats({
        distance: 0,
        maxSpeed: 0,
        avgSpeed: 0,
        totalTime: 0,
        elevationGain: 0
      });
      
      timerInterval.current = setInterval(() => {
        setElapsedTime(prev => prev + 1000);
      }, 1000);

      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed, altitude } = position.coords;
          const newPoint: GeoPoint = {
            lat: latitude,
            lng: longitude,
            timestamp: position.timestamp,
            speed: speed || 0,
            altitude: altitude || 0
          };

          setCurrentPos([latitude, longitude]);
          
          setRoute(prev => {
            const lastPoint = prev[prev.length - 1];
            if (lastPoint) {
              const d = calculateDistance(lastPoint, newPoint);
              // Only add if moved more than 2 meters to avoid jitter
              if (d > 2) {
                const newDistance = stats.distance + d;
                const newMaxSpeed = Math.max(stats.maxSpeed, speed || 0);
                const elevationDiff = altitude && lastPoint.altitude ? Math.max(0, altitude - lastPoint.altitude) : 0;
                
                setStats(s => ({
                  ...s,
                  distance: newDistance,
                  maxSpeed: newMaxSpeed,
                  elevationGain: s.elevationGain + elevationDiff,
                  avgSpeed: newDistance / ((Date.now() - (startTime || Date.now())) / 1000)
                }));
                return [...prev, newPoint];
              }
              return prev;
            }
            return [newPoint];
          });
        },
        (error) => console.error(error),
        { enableHighAccuracy: true }
      );
    }
  }, [isTracking, stats.distance, stats.maxSpeed, startTime]);

  // Initial position
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentPos([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.error(err)
    );
  }, []);

  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatSpeed = (ms: number) => (ms * 3.6).toFixed(1); // m/s to km/h

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Mountain className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SkiTrack Pro</h1>
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Session Active</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-xs text-zinc-500 font-mono uppercase">Duration</span>
            <span className="text-xl font-mono font-bold text-emerald-400">{formatTime(elapsedTime)}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        {/* Map Container */}
        <div className="absolute inset-0 z-0">
          {currentPos && (
            <MapContainer 
              center={currentPos} 
              zoom={15} 
              zoomControl={false}
              className="w-full h-full"
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              <MapUpdater center={currentPos} />
              
              {route.length > 1 && (
                <Polyline 
                  positions={route.map(p => [p.lat, p.lng])} 
                  color="#10b981" 
                  weight={4}
                  opacity={0.8}
                />
              )}
              
              {currentPos && (
                <CircleMarker 
                  center={currentPos} 
                  radius={8}
                  pathOptions={{ fillColor: '#10b981', fillOpacity: 1, color: 'white', weight: 2 }}
                />
              )}
            </MapContainer>
          )}
        </div>

        {/* Stats Overlay - Top */}
        <div className="absolute top-4 left-4 right-4 grid grid-cols-2 md:grid-cols-4 gap-4 z-10">
          <StatCard 
            label="Distance" 
            value={(stats.distance / 1000).toFixed(2)} 
            unit="km" 
            icon={<Navigation className="w-4 h-4" />} 
          />
          <StatCard 
            label="Current Speed" 
            value={formatSpeed(route[route.length - 1]?.speed || 0)} 
            unit="km/h" 
            icon={<Zap className="w-4 h-4" />} 
          />
          <StatCard 
            label="Max Speed" 
            value={formatSpeed(stats.maxSpeed)} 
            unit="km/h" 
            icon={<TrendingUp className="w-4 h-4" />} 
          />
          <StatCard 
            label="Elevation Gain" 
            value={stats.elevationGain.toFixed(0)} 
            unit="m" 
            icon={<Activity className="w-4 h-4" />} 
          />
        </div>

        {/* Controls - Bottom */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTracking}
            className={`flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg shadow-2xl transition-colors ${
              isTracking 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
          >
            {isTracking ? (
              <>
                <Square className="w-6 h-6 fill-current" />
                Stop Tracking
              </>
            ) : (
              <>
                <Play className="w-6 h-6 fill-current" />
                Start Tracking
              </>
            )}
          </motion.button>
        </div>

        {/* Side Controls */}
        <div className="absolute right-4 bottom-24 flex flex-col gap-2 z-10">
          <IconButton icon={<MapIcon className="w-5 h-5" />} />
          <IconButton icon={<History className="w-5 h-5" />} />
          <IconButton icon={<Settings className="w-5 h-5" />} />
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="px-6 py-2 border-t border-zinc-800 bg-zinc-900 flex justify-between items-center text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isTracking ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
            GPS Status: {currentPos ? 'Locked' : 'Searching...'}
          </span>
          <span>Lat: {currentPos?.[0].toFixed(4) || '---'}</span>
          <span>Lng: {currentPos?.[1].toFixed(4) || '---'}</span>
        </div>
        <div>v1.0.4-stable</div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, unit, icon }: { label: string, value: string, unit: string, icon: React.ReactNode }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-4 rounded-2xl shadow-lg"
    >
      <div className="flex items-center gap-2 text-zinc-500 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono font-bold text-zinc-100">{value}</span>
        <span className="text-xs text-zinc-500 font-medium">{unit}</span>
      </div>
    </motion.div>
  );
}

function IconButton({ icon }: { icon: React.ReactNode }) {
  return (
    <button className="p-3 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-xl text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all shadow-lg">
      {icon}
    </button>
  );
}
