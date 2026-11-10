import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'dishpatch.location';
export const DEFAULT_LOCATION = { lat: 22.5726, lng: 88.3639, label: 'Central Kolkata' };

const LocationContext = createContext(null);

const valid = (l) => l && Number.isFinite(l.lat) && Number.isFinite(l.lng);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (valid(saved)) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCATION;
}

/** The customer's delivery location. Drives which restaurants are shown, distances and delivery fees. */
export function LocationProvider({ children }) {
  const [location, setLocation] = useState(load);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(location));
    } catch {
      /* ignore */
    }
  }, [location]);

  const detect = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Your browser cannot share its location.'));
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' }),
          () => reject(new Error('Could not get your location. Allow access, or pick a spot on the map.')),
          { timeout: 8000 }
        );
      }),
    []
  );

  const value = useMemo(
    () => ({ location, setLocation, detect, pickerOpen, openPicker: () => setPickerOpen(true), closePicker: () => setPickerOpen(false) }),
    [location, detect, pickerOpen]
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export const useDeliveryLocation = () => useContext(LocationContext);
