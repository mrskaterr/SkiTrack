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
  Activity,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import { GeoPoint, SessionStats } from './types';
import { generateAppIcon } from './services/iconService';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
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

function MapUpdater({ center, follow }: { center: [number, number], follow: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    // Fix for partial map loading - run once when map is ready
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 500);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (follow) {
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map, follow]);
  return null;
}

export default function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [route, setRoute] = useState<GeoPoint[]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | 'unknown'>('unknown');
  const [hasStarted, setHasStarted] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [stats, setStats] = useState<SessionStats>({
    distance: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    totalTime: 0,
    elevationGain: 0,
    elevationLoss: 0
  });
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [appIcon, setAppIcon] = useState<string | null>(null);
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  
  const watchId = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef<SessionStats>(stats);
  const routeRef = useRef<GeoPoint[]>([]);
  const startTimeRef = useRef<number | null>(null);

  // Sync refs with state for tracking logic
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

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
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
      setRoute([]);
      routeRef.current = [];
      setElapsedTime(0);
      const initialStats = {
        distance: 0,
        maxSpeed: 0,
        avgSpeed: 0,
        totalTime: 0,
        elevationGain: 0,
        elevationLoss: 0
      };
      setStats(initialStats);
      statsRef.current = initialStats;
      
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
          
          const lastPoint = routeRef.current[routeRef.current.length - 1];
          if (lastPoint) {
            const d = calculateDistance(lastPoint, newPoint);
            // Only add if moved more than 2 meters to avoid jitter
            if (d > 2) {
              const currentStats = statsRef.current;
              const newDistance = currentStats.distance + d;
              const newMaxSpeed = Math.max(currentStats.maxSpeed, speed || 0);
              
              let elevationGain = currentStats.elevationGain;
              let elevationLoss = currentStats.elevationLoss;
              
              if (altitude !== null && lastPoint.altitude !== null) {
                const diff = altitude - lastPoint.altitude;
                if (diff > 0.5) elevationGain += diff; // Filter small noise
                if (diff < -0.5) elevationLoss += Math.abs(diff);
              }
              
              const updatedStats = {
                ...currentStats,
                distance: newDistance,
                maxSpeed: newMaxSpeed,
                elevationGain,
                elevationLoss,
                avgSpeed: newDistance / ((Date.now() - (startTimeRef.current || Date.now())) / 1000)
              };

              setStats(updatedStats);
              statsRef.current = updatedStats;
              setRoute(prev => [...prev, newPoint]);
              routeRef.current = [...routeRef.current, newPoint];
            }
          } else {
            setRoute([newPoint]);
            routeRef.current = [newPoint];
          }
        },
        (error) => console.error("Geolocation error:", error),
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  }, [isTracking]);

  // Initial position
  const getInitialLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationError("Twoje urządzenie nie obsługuje geolokalizacji.");
      return;
    }

    setIsLocating(true);
    setLocationError(null);
    setHasStarted(true);

    // Check permission status if API is available
    if ('permissions' in navigator) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(status.state);
        status.onchange = () => setPermissionStatus(status.state);
      } catch (e) {
        console.warn("Permissions API not supported for geolocation");
      }
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentPos([pos.coords.latitude, pos.coords.longitude]);
        setIsLocating(false);
        setPermissionStatus('granted');
      },
      (err) => {
        console.error("Initial location error:", err);
        let msg = "Błąd lokalizacji.";
        if (err.code === 1) {
          msg = "Brak uprawnień do lokalizacji. Upewnij się, że w ustawieniach telefonu aplikacja ma dostęp do GPS.";
          setPermissionStatus('denied');
        } else if (err.code === 2) {
          msg = "Sygnał GPS jest zbyt słaby. Wyjdź na zewnątrz.";
        } else if (err.code === 3) {
          msg = "Przekroczono czas oczekiwania na sygnał GPS.";
        }
        setLocationError(msg);
        setIsLocating(false);
      },
      options
    );
  }, []);

  // No auto-start to avoid browser blocking
  useEffect(() => {
    // Just check permission status without requesting
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(status => setPermissionStatus(status.state))
        .catch(() => {});
    }
  }, []);

  const centerMap = () => {
    if (currentPos) {
      setFollowUser(true);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatSpeed = (ms: number) => (ms * 3.6).toFixed(1); // m/s to km/h

  const handleGenerateIcon = async () => {
    setIsGeneratingIcon(true);
    try {
      const icon = await generateAppIcon();
      setAppIcon(icon);
    } catch (error) {
      console.error("Failed to generate icon:", error);
    } finally {
      setIsGeneratingIcon(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg">
            <Mountain className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight leading-none">SkiTrack Pro</h1>
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">
              {isTracking ? 'Tracking Active' : 'Ready to Start'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-zinc-500 font-mono uppercase leading-none mb-1">Duration</span>
            <span className="text-lg font-mono font-bold text-emerald-400 leading-none">{formatTime(elapsedTime)}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        {/* Loading / Error / Start States */}
        <AnimatePresence>
          {(!hasStarted || isLocating || locationError) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] bg-zinc-950 flex flex-col items-center justify-center p-8 text-center"
            >
              {!hasStarted ? (
                <>
                  <div className="p-6 bg-emerald-500/10 rounded-full mb-6">
                    <Navigation className="w-12 h-12 text-emerald-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-100 mb-3">Wymagana Lokalizacja</h2>
                  <p className="text-zinc-400 mb-8 max-w-xs">
                    Aby śledzić Twoją trasę na nartach, aplikacja potrzebuje dostępu do GPS.
                  </p>
                  <button 
                    onClick={getInitialLocation}
                    className="w-full max-w-xs py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg transition-all shadow-xl shadow-emerald-500/20"
                  >
                    Udostępnij Lokalizację
                  </button>
                </>
              ) : isLocating ? (
                <>
                  <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
                  <p className="text-zinc-400 font-medium tracking-wide">Szukanie sygnału GPS...</p>
                  <p className="text-zinc-500 text-sm mt-2">Upewnij się, że jesteś na zewnątrz</p>
                </>
              ) : (
                <>
                  <div className="p-4 bg-red-500/10 rounded-full mb-4">
                    <Activity className="w-8 h-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-100 mb-2">
                    {permissionStatus === 'denied' ? 'Brak Uprawnień' : 'Błąd GPS'}
                  </h2>
                  <p className="text-zinc-400 mb-6 max-w-xs">{locationError}</p>
                  <button 
                    onClick={getInitialLocation}
                    className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold transition-all shadow-xl shadow-emerald-500/20"
                  >
                    Spróbuj Ponownie
                  </button>
                  <p className="text-zinc-500 text-xs mt-6 max-w-[240px]">
                    Jeśli używasz aplikacji APK, upewnij się, że przy jej tworzeniu zaznaczono uprawnienia GPS (ACCESS_FINE_LOCATION).
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map Container */}
        <div className="absolute inset-0 z-0">
          {currentPos && (
            <MapContainer 
              center={currentPos} 
              zoom={15} 
              zoomControl={false}
              className="w-full h-full"
              preferCanvas={true}
            >
              <TileLayer
                url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
                maxZoom={17}
              />
              <MapUpdater center={currentPos} follow={followUser} />
              
              {route.length > 1 && (
                <Polyline 
                  positions={route.map(p => [p.lat, p.lng])} 
                  color="#ef4444" 
                  weight={6}
                  opacity={1}
                />
              )}
              
              {currentPos && (
                <CircleMarker 
                  center={currentPos} 
                  radius={8}
                  pathOptions={{ fillColor: '#ef4444', fillOpacity: 1, color: 'white', weight: 3 }}
                />
              )}
            </MapContainer>
          )}
        </div>

        {/* Stats Overlay - Top */}
        <div className="absolute top-3 left-3 right-3 grid grid-cols-2 gap-2 z-10">
          <StatCard 
            label="Distance" 
            value={(stats.distance / 1000).toFixed(2)} 
            unit="km" 
            icon={<Navigation className="w-3.5 h-3.5" />} 
          />
          <StatCard 
            label="Altitude" 
            value={(route[route.length - 1]?.altitude || 0).toFixed(0)} 
            unit="m" 
            icon={<Mountain className="w-3.5 h-3.5" />} 
          />
          <StatCard 
            label="Speed" 
            value={formatSpeed(route[route.length - 1]?.speed || 0)} 
            unit="km/h" 
            icon={<Zap className="w-3.5 h-3.5" />} 
          />
          <StatCard 
            label="Max Speed" 
            value={formatSpeed(stats.maxSpeed)} 
            unit="km/h" 
            icon={<TrendingUp className="w-3.5 h-3.5" />} 
          />
        </div>

        {/* Controls - Bottom */}
        <div className="absolute bottom-8 left-0 right-0 px-6 flex justify-center items-center gap-4 z-10">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTracking}
            className={`flex-1 max-w-[240px] flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-lg shadow-2xl transition-colors ${
              isTracking 
                ? 'bg-red-500 text-white' 
                : 'bg-emerald-500 text-white'
            }`}
          >
            {isTracking ? (
              <>
                <Square className="w-5 h-5 fill-current" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                Start
              </>
            )}
          </motion.button>
        </div>

        {/* Side Controls */}
        <div className="absolute right-3 bottom-28 flex flex-col gap-2 z-10">
          <IconButton 
            active={followUser}
            onClick={() => setFollowUser(!followUser)}
            icon={<Navigation className={`w-5 h-5 ${followUser ? 'text-emerald-500' : 'text-zinc-400'}`} />} 
          />
          <IconButton 
            onClick={centerMap}
            icon={<MapIcon className="w-5 h-5" />} 
          />
          <IconButton 
            onClick={handleGenerateIcon}
            active={!!appIcon}
            icon={isGeneratingIcon ? <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /> : <Sparkles className="w-5 h-5" />} 
          />
          <IconButton icon={<History className="w-5 h-5" />} />
        </div>

        {/* App Icon Preview Modal */}
        <AnimatePresence>
          {appIcon && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8"
            >
              <div className="relative group">
                <img 
                  src={appIcon} 
                  alt="App Icon" 
                  className="w-64 h-64 rounded-[4rem] shadow-2xl border-4 border-zinc-800"
                />
                <div className="absolute -inset-4 bg-emerald-500/20 blur-3xl -z-10 group-hover:opacity-100 transition-opacity" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-100 mt-8 mb-2">SkiTrack Pro Icon</h2>
              <p className="text-zinc-400 text-center mb-8 max-w-xs">Twoja nowa ikona aplikacji została wygenerowana przez AI.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setAppIcon(null)}
                  className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-colors"
                >
                  Zamknij
                </button>
                <a 
                  href={appIcon} 
                  download="skitrack-icon.png"
                  className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors"
                >
                  Pobierz
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 p-3 rounded-xl shadow-lg"
    >
      <div className="flex items-center gap-1.5 text-zinc-500 mb-0.5">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-mono font-bold text-zinc-100">{value}</span>
        <span className="text-[10px] text-zinc-500 font-medium">{unit}</span>
      </div>
    </motion.div>
  );
}

function IconButton({ icon, onClick, active }: { icon: React.ReactNode, onClick?: () => void, active?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`p-3 backdrop-blur-xl border rounded-xl transition-all shadow-lg ${
        active 
          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500' 
          : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-emerald-500'
      }`}
    >
      {icon}
    </button>
  );
}
