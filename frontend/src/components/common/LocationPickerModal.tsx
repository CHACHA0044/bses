'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin,
  Navigation,
  Check,
  X,
  Search,
  Compass,
  Building,
  Info,
  Loader2,
} from 'lucide-react';

// Augment Window to include Leaflet's global `L` (loaded dynamically, only
// when the user actually opens the map and only on a per-mount basis).
declare global {
  interface Window {
    L: any;
  }
}

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAddress: (address: string) => void;
  initialAddress?: string;
}

interface Landmark {
  name: string;
  area: string;
  pinCode: string;
  lat: number;
  lng: number;
  fullAddress: string;
}

const DELHI_LANDMARKS: Landmark[] = [
  {
    name: 'Rajouri Garden',
    area: 'West Delhi',
    pinCode: '110027',
    lat: 28.6415,
    lng: 77.1209,
    fullAddress: 'Block F, Rajouri Garden, Main Ring Road, New Delhi, Delhi 110027',
  },
  {
    name: 'Nehru Place',
    area: 'South Delhi',
    pinCode: '110019',
    lat: 28.5494,
    lng: 77.2519,
    fullAddress: 'Devika Tower, Nehru Place Market, Outer Ring Road, New Delhi, Delhi 110019',
  },
  {
    name: 'Mayur Vihar Phase 1',
    area: 'East Delhi',
    pinCode: '110091',
    lat: 28.6083,
    lng: 77.2952,
    fullAddress: 'Pocket 1, Mayur Vihar Phase 1, Near Metro Station, Delhi 110091',
  },
  {
    name: 'Dwarka Sector 12',
    area: 'South-West Delhi',
    pinCode: '110075',
    lat: 28.5921,
    lng: 77.046,
    fullAddress: 'Plot 14, Sector 12, Dwarka, Main DDC Road, New Delhi, Delhi 110075',
  },
  {
    name: 'Rohini Sector 7',
    area: 'North-West Delhi',
    pinCode: '110085',
    lat: 28.7041,
    lng: 77.1025,
    fullAddress: 'Pocket D-12, Sector 7, Rohini, Naharpur Road, Delhi 110085',
  },
  {
    name: 'Lajpat Nagar II',
    area: 'South Delhi',
    pinCode: '110024',
    lat: 28.5677,
    lng: 77.2433,
    fullAddress: 'Block E, Central Market, Lajpat Nagar II, New Delhi, Delhi 110024',
  },
  {
    name: 'Connaught Place',
    area: 'Central Delhi',
    pinCode: '110001',
    lat: 28.6315,
    lng: 77.2167,
    fullAddress: 'Inner Circle, Block A, Connaught Place, New Delhi, Delhi 110001',
  },
  {
    name: 'Janakpuri District Centre',
    area: 'West Delhi',
    pinCode: '110058',
    lat: 28.6219,
    lng: 77.0878,
    fullAddress: 'Block B1, Janakpuri District Centre, Najafgarh Road, New Delhi, Delhi 110058',
  },
  {
    name: 'Saket District Centre',
    area: 'South Delhi',
    pinCode: '110017',
    lat: 28.5284,
    lng: 77.2188,
    fullAddress: 'Press Enclave Road, Saket District Centre, New Delhi, Delhi 110017',
  },
  {
    name: 'Pitampura TV Tower',
    area: 'North-West Delhi',
    pinCode: '110034',
    lat: 28.6987,
    lng: 77.1394,
    fullAddress: 'Block LU, Pitampura, TV Tower Circle, Delhi 110034',
  },
];

const DEFAULT_CENTER: { lat: number; lng: number } = { lat: 28.6139, lng: 77.209 };
const LEAFLET_CSS_ID = 'bses-leaflet-css';
const LEAFLET_SCRIPT_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const REVERSE_GEOCODE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

/* ────────────────────────────────────────────────────────────────────────────
 * Leaflet lazy-loader — shared across mounts so re-opening the modal does not
 * re-download the 145 KB script on every click.
 * ──────────────────────────────────────────────────────────────────────────── */
let leafletLoadPromise: Promise<any> | null = null;

function ensureLeafletCss(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LEAFLET_CSS_ID)) return;
  const link = document.createElement('link');
  link.id = LEAFLET_CSS_ID;
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS_SRC;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;

  ensureLeafletCss();

  leafletLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-bses-leaflet="true"]`);
    if (existing) {
      // Another consumer is already loading the script — chain onto it.
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', () => reject(new Error('Leaflet script failed to load')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.dataset.bsesLeaflet = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet script failed to load'));
    document.head.appendChild(script);
  }).catch((err) => {
    // Allow a retry next time the user opens the modal.
    leafletLoadPromise = null;
    throw err;
  });

  return leafletLoadPromise;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Debounce helper used to throttle reverse-geocoding while the user drags.
 * ──────────────────────────────────────────────────────────────────────────── */
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  const debounced = useCallback(
    ((...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fnRef.current(...args);
        timerRef.current = null;
      }, delay);
    }) as T,
    [delay],
  );
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  return debounced;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Map subcomponent — only mounted once the modal is actually visible AND the
 * "Show map" toggle is on. The expensive Leaflet init therefore never blocks
 * the initial paint of the modal shell.
 * ──────────────────────────────────────────────────────────────────────────── */
interface LeafletMapProps {
  initialCenter: { lat: number; lng: number };
  onLocationChange: (
    lat: number,
    lng: number,
    source: 'click' | 'drag' | 'gps' | 'landmark',
  ) => void;
}

const LeafletMap: React.FC<LeafletMapProps> = ({ initialCenter, onLocationChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Stash the latest callback in a ref so the Leaflet event handlers (which
  // are bound once on init) always invoke the most recent closure. This keeps
  // marker/move callbacks outside React state — no React re-render is fired on
  // every mouse move or marker drag tick.
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        const map = L.map(container, {
          center: [initialCenter.lat, initialCenter.lng],
          zoom: 14,
          zoomControl: true,
          preferCanvas: true,
          // Disable a couple of heavy interactions on mobile so dragging the
          // pin never lags behind a finger.
          fadeAnimation: false,
          zoomAnimation: false,
          markerZoomAnimation: false,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `<div style="
            background-color:#f59e0b;
            width:36px;height:36px;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            border:3px solid #ffffff;
            box-shadow:0 4px 10px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;">
            <div style="width:12px;height:12px;background:#0f172a;border-radius:50%;"></div>
          </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        });

        const marker = L.marker([initialCenter.lat, initialCenter.lng], {
          draggable: true,
          icon: customIcon,
          autoPanPadding: [40, 40],
        }).addTo(map);

        mapRef.current = map;
        markerRef.current = marker;

        // ── Event handlers ──
        // Click on the map — update the marker position and notify the parent
        // (which then debounces a reverse-geocode).
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          marker.setLatLng([lat, lng]);
          onLocationChangeRef.current(lat, lng, 'click');
        });

        // Marker drag — notify on `dragend`, not `drag` (which fires per pixel).
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          onLocationChangeRef.current(p.lat, p.lng, 'drag');
        });

        // After layout settles (modal open + CSS animation), Leaflet can
        // compute the correct tile container size. Calling `invalidateSize`
        // here eliminates the "gray half" / misaligned tiles that show up
        // when the map was initialised before it was visible.
        requestAnimationFrame(() => map.invalidateSize());
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[LocationPicker] Failed to load Leaflet:', err?.message ?? err);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [initialCenter.lat, initialCenter.lng]);

  // Imperative handle exposed via a window event so the parent (which holds
  // the search/GPS UI) can drive the map without ever re-rendering it.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ lat: number; lng: number; zoom?: number }>).detail;
      if (!detail || !mapRef.current || !markerRef.current) return;
      const { lat, lng, zoom = 16 } = detail;
      mapRef.current.setView([lat, lng], zoom);
      markerRef.current.setLatLng([lat, lng]);
    };
    window.addEventListener('bses:location-picker:move', handler as EventListener);
    return () => window.removeEventListener('bses:location-picker:move', handler as EventListener);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0" data-testid="location-picker-map" />
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Modal shell — keeps lightweight UI state, defers Leaflet to the subcomponent
 * above, and keeps map-driven state changes outside React's render path.
 * ──────────────────────────────────────────────────────────────────────────── */
const LocationPickerModalComponent: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectAddress,
}) => {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [flatNo, setFlatNo] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [locality, setLocality] = useState('Rajouri Garden, West Delhi');
  const [pinCode, setPinCode] = useState('110027');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  // Defer mounting Leaflet until the modal animation has settled AND the user
  // has actually expanded the map. The shell renders immediately on click.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Debounce the landmark search field so filtering doesn't happen on every
  // keystroke — keeps typing snappy even with the full list in memory.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim().toLowerCase()), 120);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filteredLandmarks = useMemo(() => {
    if (!debouncedSearch) return DELHI_LANDMARKS;
    return DELHI_LANDMARKS.filter(
      (lm) =>
        lm.name.toLowerCase().includes(debouncedSearch) ||
        lm.area.toLowerCase().includes(debouncedSearch) ||
        lm.pinCode.includes(debouncedSearch),
    );
  }, [debouncedSearch]);

  // Debounced reverse-geocode so dragging the pin doesn't fire one Nominatim
  // request per pixel. The latest fetch wins (AbortController cancels stale
  // requests).
  const runReverseGeocode = useCallback((lat: number, lng: number) => {
    const controller = new AbortController();
    setReverseGeocoding(true);
    fetch(
      `${REVERSE_GEOCODE_ENDPOINT}?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal,
      },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.address) return;
        const addr = data.address;
        const road = addr.road || addr.suburb || addr.neighbourhood || addr.residential || '';
        const suburb = addr.suburb || addr.city_district || addr.district || 'Delhi';
        const pc = addr.postcode || '110001';
        setStreetAddress(road);
        setLocality(`${suburb}, Delhi`);
        setPinCode(pc);
      })
      .catch((err: any) => {
        if (err?.name !== 'AbortError') {
          // Nominatim failures are non-fatal — keep the previous values.
        }
      })
      .finally(() => setReverseGeocoding(false));
    return () => controller.abort();
  }, []);

  const debouncedReverseGeocode = useDebouncedCallback(runReverseGeocode, 400);

  // Bridge: when the map reports a new location, update the lightweight
  // coords state and schedule a debounced reverse-geocode. The map itself
  // never re-renders due to these updates — it lives behind its own
  // component boundary and only re-renders if initialCenter changes.
  const handleLocationChange = useCallback(
    (lat: number, lng: number, _source: 'click' | 'drag' | 'gps' | 'landmark') => {
      setCoords({ lat, lng });
      debouncedReverseGeocode(lat, lng);
    },
    [debouncedReverseGeocode],
  );

  // Stable callback for the Leaflet subcomponent.
  const onLocationChange = useMemo(() => handleLocationChange, [handleLocationChange]);

  const handleLandmarkSelect = useCallback((lm: Landmark) => {
    setCoords({ lat: lm.lat, lng: lm.lng });
    setLocality(lm.name);
    setPinCode(lm.pinCode);
    setStreetAddress(lm.fullAddress);
    setShowMap(true);
    // Imperative move via custom event so Leaflet (which lives outside React
    // state) animates the camera without re-mounting the tile layer.
    window.dispatchEvent(
      new CustomEvent('bses:location-picker:move', {
        detail: { lat: lm.lat, lng: lm.lng, zoom: 15 },
      }),
    );
  }, []);

  const handleDetectGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setGeoError(null);
    setShowMap(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setIsLocating(false);
        setCoords({ lat: latitude, lng: longitude });
        window.dispatchEvent(
          new CustomEvent('bses:location-picker:move', {
            detail: { lat: latitude, lng: longitude, zoom: 16 },
          }),
        );
        runReverseGeocode(latitude, longitude);
      },
      (err) => {
        setIsLocating(false);
        setGeoError(
          `Unable to retrieve location (${err.message}). Please click on the map directly.`,
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [runReverseGeocode]);

  const handleConfirmLocation = useCallback(() => {
    const fullAddrParts: string[] = [];
    if (flatNo.trim()) fullAddrParts.push(`Flat/House No. ${flatNo.trim()}`);
    if (streetAddress.trim()) fullAddrParts.push(streetAddress.trim());
    else if (locality.trim()) fullAddrParts.push(locality.trim());
    if (!streetAddress.includes('Delhi') && !locality.includes('Delhi')) {
      fullAddrParts.push('Delhi');
    }
    if (pinCode.trim() && !streetAddress.includes(pinCode)) {
      fullAddrParts.push(`Pin Code ${pinCode.trim()}`);
    }
    onSelectAddress(fullAddrParts.join(', '));
    onClose();
  }, [flatNo, streetAddress, locality, pinCode, onSelectAddress, onClose]);

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bses-location-picker-title"
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-slate-950/65 backdrop-blur-md p-0 sm:p-4 overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative bg-white w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col my-0 sm:my-2">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 sm:p-2 bg-amber-500/20 text-amber-400 rounded-xl shrink-0">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="bses-location-picker-title"
                className="text-sm sm:text-base font-bold leading-tight truncate"
              >
                Pick Property Location on Map
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                BSES Delhi Electricity Supply Area Map
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer shrink-0"
            aria-label="Close location picker"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-3 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDetectGPS}
              disabled={isLocating}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50 text-xs w-full sm:w-auto"
            >
              {isLocating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5" />
              )}
              <span>{isLocating ? 'Detecting GPS…' : 'Detect My GPS Location'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 font-bold text-xs transition active:scale-95 cursor-pointer"
              aria-pressed={showMap}
            >
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 text-slate-700 font-mono text-[11px] bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm w-full sm:w-auto">
            <Compass className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              Lat: <strong>{coords.lat.toFixed(4)}</strong>, Lng:{' '}
              <strong>{coords.lng.toFixed(4)}</strong>
              {reverseGeocoding ? <span className="ml-2 text-amber-600">· resolving…</span> : null}
            </span>
          </div>
        </div>

        {geoError && (
          <div
            role="alert"
            className="px-4 py-2 bg-red-50 text-red-600 text-xs border-b border-red-200 flex items-center gap-2 shrink-0"
          >
            <Info className="w-4 h-4 shrink-0" />
            <span>{geoError}</span>
          </div>
        )}

        {/* Modal Body Grid */}
        <div className="flex flex-col md:grid md:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* Map Area */}
          <div
            className={`md:col-span-7 lg:col-span-8 relative bg-slate-100 flex flex-col shrink-0 md:shrink border-b md:border-b-0 md:border-r border-slate-200 ${
              showMap ? 'h-[280px] sm:h-[340px] md:h-auto md:min-h-[420px]' : 'h-[120px]'
            }`}
          >
            {showMap ? (
              <LeafletMap initialCenter={coords} onLocationChange={onLocationChange} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center px-6">
                <div className="space-y-2 max-w-xs">
                  <MapPin className="w-7 h-7 text-amber-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">
                    Pick from a landmark below or detect GPS — the map will appear here.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    The map loads only when you need it so the picker opens instantly.
                  </p>
                </div>
              </div>
            )}

            {showMap && (
              <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md border border-slate-200 text-slate-800 text-[11px] font-semibold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 pointer-events-none max-w-[90%]">
                <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Click map or drag pin to select building</span>
              </div>
            )}
          </div>

          {/* Location Sidebar Details */}
          <div className="md:col-span-5 lg:col-span-4 p-4 sm:p-5 bg-white flex flex-col justify-between overflow-y-auto space-y-4 flex-1 md:flex-initial">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Quick Select Landmark
              </label>

              {/* Search Landmark */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Delhi area or pincode…"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition"
                  aria-label="Search landmark"
                />
              </div>

              {/* Landmark List */}
              <div
                role="listbox"
                aria-label="Delhi landmarks"
                className="max-h-36 sm:max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs"
              >
                {filteredLandmarks.length === 0 && (
                  <p className="text-[11px] text-slate-500 px-2 py-3 text-center">
                    No landmark matches your search.
                  </p>
                )}
                {filteredLandmarks.map((lm) => (
                  <button
                    type="button"
                    key={lm.name}
                    onClick={() => handleLandmarkSelect(lm)}
                    className="w-full text-left p-2 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition flex items-start gap-2 group cursor-pointer"
                  >
                    <Building className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-xs group-hover:text-amber-700 truncate">
                        {lm.name}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {lm.area} • Pin {lm.pinCode}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Address Details Input */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Selected Location Details
              </label>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Flat / House / Plot No. (Optional)
                </span>
                <input
                  type="text"
                  value={flatNo}
                  onChange={(e) => setFlatNo(e.target.value)}
                  placeholder="e.g. Flat B-112 or Plot 42"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition"
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Area & Street Address
                </span>
                <textarea
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition"
                  placeholder="Street name, landmark, colony"
                />
              </div>
            </div>

            {/* Confirm Button */}
            <button
              type="button"
              onClick={handleConfirmLocation}
              className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-3 sm:py-2.5 px-4 rounded-xl shadow-md cursor-pointer active:scale-95 transition mt-2 shrink-0"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Use Selected Address</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export const LocationPickerModal = React.memo(LocationPickerModalComponent);
