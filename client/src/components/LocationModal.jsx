import { useEffect, useState } from 'react';
import { useDeliveryLocation } from '../context/LocationContext';
import { useToast } from '../context/ToastContext';
import { MapPicker } from './Maps';

/** "Where should we deliver?" dialog: use GPS, or drop a pin on the map. */
export default function LocationModal() {
  const { location, setLocation, detect, pickerOpen, closePicker } = useDeliveryLocation();
  const toast = useToast();
  const [draft, setDraft] = useState(location);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pickerOpen) setDraft(location);
  }, [pickerOpen, location]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e) => e.key === 'Escape' && closePicker();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen, closePicker]);

  if (!pickerOpen) return null;

  const useGps = async () => {
    setBusy(true);
    try {
      setDraft(await detect());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    setLocation({ lat: draft.lat, lng: draft.lng, label: draft.label === 'Current location' ? 'Current location' : 'Pinned location' });
    closePicker();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closePicker()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Choose delivery location">
        <h2>Where should we deliver?</h2>
        <p className="muted">Restaurants, delivery fees and ETAs are based on this spot. Click the map or drag the pin.</p>
        <MapPicker value={draft} onChange={(p) => setDraft({ ...p, label: 'Pinned location' })} />
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={useGps} disabled={busy}>
            {busy ? 'Locating…' : '📡 Use my current location'}
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost-dark" onClick={closePicker}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm}>Confirm location</button>
        </div>
      </div>
    </div>
  );
}
