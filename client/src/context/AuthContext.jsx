import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

/** Where each role lands after signing in. */
export const homeFor = (role) => (role === 'owner' ? '/owner' : role === 'rider' ? '/rider' : '/');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken())); // only wait if there is a token to check

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => {}) // a 401 already triggers logout()
      .finally(() => setLoading(false));
  }, []);

  const accept = ({ user: u, token }) => {
    setToken(token);
    setUser(u);
    return u;
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (email, password) => accept(await api.post('/auth/login', { email, password })),
      register: async (data) => accept(await api.post('/auth/register', data)),
      updateProfile: async (data) => accept(await api.put('/auth/profile', data)),
      logout,
    }),
    [user, loading, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
