import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormField, { fieldErrors } from '../components/FormField';
import { homeFor, useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const DEMOS = [
  { label: 'Customer', email: 'customer@dishpatch.dev', password: 'Customer@123' },
  { label: 'Restaurant owner', email: 'owner@dishpatch.dev', password: 'Owner@12345' },
  { label: 'Delivery partner', email: 'rider@dishpatch.dev', password: 'Rider@12345' },
];

const ROLES = [
  { value: 'customer', title: 'I want to order food', desc: 'Browse restaurants and track deliveries' },
  { value: 'owner', title: 'I run a restaurant', desc: 'Manage menu, orders and offers' },
  { value: 'rider', title: 'I want to deliver', desc: 'Pick up orders and earn per delivery' },
];

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds = form) => {
    e?.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const user = await login(creds.email, creds.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(location.state?.from && user.role === 'customer' ? location.state.from : homeFor(user.role), { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1>Log in</h1>
        <FormField label="Email" error={errors.email}>
          <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Password" error={errors.password}>
          <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </FormField>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="muted small">New here? <Link to="/register">Create an account</Link></p>
        <div className="demo-box">
          <span className="muted small">Try a demo account (after running the seed):</span>
          <div className="chips chips-sm">
            {DEMOS.map((d) => (
              <button type="button" key={d.label} className="chip" disabled={busy} onClick={() => { setForm(d); submit(null, d); }}>{d.label}</button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const user = await register(form);
      toast.success(`Welcome to Dishpatch, ${user.name.split(' ')[0]}!`);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <div className="role-picker" role="radiogroup" aria-label="Account type">
          {ROLES.map((r) => (
            <label key={r.value} className={`role-option ${form.role === r.value ? 'on' : ''}`}>
              <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => setForm({ ...form, role: r.value })} />
              <strong>{r.title}</strong>
              <span className="muted small">{r.desc}</span>
            </label>
          ))}
        </div>
        <FormField label="Full name" error={errors.name}>
          <input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number">
          <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </FormField>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
        <p className="muted small">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
