'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Check, X, Search, Compass, Building, Info, Loader2 } from 'lucide-react';

// Augment Window to include Leaflet's global `L` (loaded via CDN script tag at runtime)
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

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectAddress,
  initialAddress = '',
}) => {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 28.6139, lng: 77.209 });
  const [flatNo, setFlatNo] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [locality, setLocality] = useState('Rajouri Garden, West Delhi');
  const [pinCode, setPinCode] = useState('110027');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize & load map dynamically
  useEffect(() => {
    if (!isOpen) return;

    // Load Leaflet CSS dynamically if not present
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    let isMounted = true;

    const initMap = async () => {
      if (typeof window === 'undefined') return;

      // Ensure Leaflet JS is loaded
      if (!window.L) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      if (!isMounted || !mapContainerRef.current || !window.L) return;

      // Clean up previous instance
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const L = window.L;
      const initialLat = coords.lat;
      const initialLng = coords.lng;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom Pin Icon
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
          background-color: #f59e0b;
          width: 36px;
          height: 36px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid #ffffff;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 12px;
            height: 12px;
            background-color: #0f172a;
            border-radius: 50%;
          "></div>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
        icon: customIcon,
      }).addTo(map);

      markerRef.current = marker;
      leafletMapRef.current = map;

      // Map Click Handler
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        updateLocationFromCoords(lat, lng);
      });

      // Marker Drag Handler
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        updateLocationFromCoords(position.lat, position.lng);
      });
    };

    const timer = setTimeout(initMap, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const updateLocationFromCoords = async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    try {
      // Reverse geocode via Nominatim
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const road = addr.road || addr.suburb || addr.neighbourhood || addr.residential || '';
        const suburb = addr.suburb || addr.city_district || addr.district || 'Delhi';
        const pc = addr.postcode || '110001';

        setStreetAddress(road);
        setLocality(`${suburb}, Delhi`);
        setPinCode(pc);
      }
    } catch {
      /* Fallback to landmark nearest check */
    }
  };

  const handleLandmarkSelect = (lm: Landmark) => {
    setCoords({ lat: lm.lat, lng: lm.lng });
    setLocality(lm.name);
    setPinCode(lm.pinCode);
    setStreetAddress(lm.fullAddress);

    if (leafletMapRef.current && markerRef.current) {
      leafletMapRef.current.setView([lm.lat, lm.lng], 15);
      markerRef.current.setLatLng([lm.lat, lm.lng]);
    }
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setIsLocating(false);
        setCoords({ lat: latitude, lng: longitude });

        if (leafletMapRef.current && markerRef.current) {
          leafletMapRef.current.setView([latitude, longitude], 16);
          markerRef.current.setLatLng([latitude, longitude]);
        }
        updateLocationFromCoords(latitude, longitude);
      },
      (err) => {
        setIsLocating(false);
        setGeoError(`Unable to retrieve location (${err.message}). Please click on the map directly.`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleConfirmLocation = () => {
    const fullAddrParts = [];
    if (flatNo.trim()) fullAddrParts.push(`Flat/House No. ${flatNo.trim()}`);
    if (streetAddress.trim()) fullAddrParts.push(streetAddress.trim());
    else if (locality.trim()) fullAddrParts.push(locality.trim());
    if (!streetAddress.includes('Delhi') && !locality.includes('Delhi')) {
      fullAddrParts.push('Delhi');
    }
    if (pinCode.trim() && !streetAddress.includes(pinCode)) {
      fullAddrParts.push(`Pin Code ${pinCode.trim()}`);
    }

    const compiledAddress = fullAddrParts.join(', ');
    onSelectAddress(compiledAddress);
    onClose();
  };

  const filteredLandmarks = DELHI_LANDMARKS.filter(
    (lm) =>
      lm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lm.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lm.pinCode.includes(searchQuery),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Pick Property Location on Map</h3>
              <p className="text-xs text-slate-400">BSES Delhi Electricity Supply Area Map</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* GPS Location Button */}
          <button
            type="button"
            onClick={handleDetectGPS}
            disabled={isLocating}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5" />
            )}
            <span>{isLocating ? 'Detecting GPS…' : 'Detect My GPS Location'}</span>
          </button>

          {/* Coordinate Readout */}
          <div className="flex items-center gap-2 text-slate-600 font-mono text-[11px] bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <Compass className="w-3.5 h-3.5 text-amber-500" />
            <span>
              Lat: <strong>{coords.lat.toFixed(4)}</strong>, Lng: <strong>{coords.lng.toFixed(4)}</strong>
            </span>
          </div>
        </div>

        {geoError && (
          <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-b border-red-200 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>{geoError}</span>
          </div>
        )}

        {/* Modal Body Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Map Area (8 cols) */}
          <div className="md:col-span-8 relative min-h-[280px] sm:min-h-[360px] bg-slate-100 flex flex-col">
            <div ref={mapContainerRef} className="w-full h-full min-h-[300px] z-0" />

            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-md border border-slate-200 text-slate-800 text-[11px] font-medium px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-500" />
              <span>Click on map or drag pin to select exact building</span>
            </div>
          </div>

          {/* Location Sidebar (4 cols) */}
          <div className="md:col-span-4 p-4 bg-white border-l border-slate-200 flex flex-col justify-between overflow-y-auto space-y-4 max-h-[380px] md:max-h-none">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                Quick Select Landmark
              </label>

              {/* Search Landmark */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Delhi area or pincode…"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Landmark List Chips */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
                {filteredLandmarks.map((lm, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleLandmarkSelect(lm)}
                    className="w-full text-left p-2 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition flex items-start gap-2 group cursor-pointer"
                  >
                    <Building className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-800 text-xs group-hover:text-amber-700">
                        {lm.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {lm.area} • Pin {lm.pinCode}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Address Details Input */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  placeholder="Street name, landmark, colony"
                />
              </div>
            </div>

            {/* Confirm Button */}
            <button
              type="button"
              onClick={handleConfirmLocation}
              className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow-md cursor-pointer active:scale-95 transition mt-2"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Use Selected Address</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
