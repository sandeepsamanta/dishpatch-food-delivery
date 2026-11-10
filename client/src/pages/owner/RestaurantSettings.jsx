import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import FormField, { fieldErrors } from '../../components/FormField';
import { MapPicker } from '../../components/Maps';
import { DEFAULT_LOCATION } from '../../context/LocationContext';
import { useToast } from '../../context/ToastContext';

/** Create (restaurant = null) or edit the owner's restaurant. Also rendered by the layout for first-time setup. */
export default function RestaurantSettings({ restaurant: given, onSaved }) {
  const ctx = useOutletContext?.();
  const restaurant = given !== undefined ? given : ctx?.restaurant;
  const reload = onSaved || ctx?.reloadRestaurant;
  const toast = useToast();
  const editing = Boolean(restaurant);

  const [form, setForm] = useState({
    name: restaurant?.name || '',
    description: restaurant?.description || '',
    cuisines: (restaurant?.cuisines || []).join(', '),
    image: restaurant?.image || '',
    address: restaurant?.address || '',
    priceForTwo: restaurant?.priceForTwo ?? 300,
    prepTime: restaurant?.prepTime ?? 25,
    minOrder: restaurant?.minOrder ?? 0,
    deliveryRadiusKm: restaurant?.deliveryRadiusKm ?? 8,
    pureVeg: restaurant?.pureVeg ?? false,
  });
  const [pin, setPin] = useState(restaurant?.location || { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const body = {
        ...form,
        cuisines: form.cuisines.split(',').map((c) => c.trim()).filter(Boolean),
        priceForTwo: Number(form.priceForTwo),
        prepTime: Number(form.prepTime),
        minOrder: Number(form.minOrder),
        deliveryRadiusKm: Number(form.deliveryRadiusKm),
        location: pin,
      };
      await (editing ? api.put('/owner/restaurant', body) : api.post('/owner/restaurant', body));
      toast.success(editing ? 'Restaurant updated' : 'Restaurant created. Now add your menu!');
      reload?.();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="form-grid">
        <FormField label="Restaurant name" error={errors.name}><input value={form.name} onChange={set('name')} maxLength={80} /></FormField>
        <FormField label="Cuisines" error={errors.cuisines} hint="Comma separated, e.g. Biryani, Mughlai"><input value={form.cuisines} onChange={set('cuisines')} /></FormField>
        <FormField label="Address" error={errors.address}><input value={form.address} onChange={set('address')} maxLength={200} /></FormField>
        <FormField label="Cover photo URL (optional)" error={errors.image}><input type="url" value={form.image} onChange={set('image')} placeholder="https://…" /></FormField>
        <FormField label="Description" error={errors.description}><textarea rows={2} value={form.description} onChange={set('description')} maxLength={400} /></FormField>
        <FormField label="Average cost for two (₹)" error={errors.priceForTwo}><input type="number" min="0" value={form.priceForTwo} onChange={set('priceForTwo')} /></FormField>
        <FormField label="Kitchen prep time (minutes)" error={errors.prepTime}><input type="number" min="5" max="120" value={form.prepTime} onChange={set('prepTime')} /></FormField>
        <FormField label="Minimum order (₹)" error={errors.minOrder}><input type="number" min="0" value={form.minOrder} onChange={set('minOrder')} /></FormField>
        <FormField label="Delivery radius (km)" error={errors.deliveryRadiusKm} hint="Customers further away cannot order"><input type="number" min="1" max="30" value={form.deliveryRadiusKm} onChange={set('deliveryRadiusKm')} /></FormField>
        <label className="check inline-check"><input type="checkbox" checked={form.pureVeg} onChange={(e) => setForm({ ...form, pureVeg: e.target.checked })} /> Pure vegetarian kitchen</label>
      </div>
      <h3>Where is your kitchen?</h3>
      <p className="muted small">Click the map or drag the pin. Delivery distance and fees are measured from here.</p>
      <MapPicker value={pin} onChange={setPin} height={260} />
      {errors.location && <p className="field-error">{errors.location}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create restaurant'}</button>
      </div>
    </form>
  );
}
