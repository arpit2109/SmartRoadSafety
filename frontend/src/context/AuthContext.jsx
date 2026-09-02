/**
 * AuthContext — provides auth state and actions to the entire component tree.
 *
 * Exposes:
 *   user          — { id, username, email, contact_no } or null
 *   isAuthenticated — boolean
 *   isLoading     — true while hydrating from localStorage on first render
 *   login(username, password)  → resolves on success, throws on failure
 *   register(data)            → resolves on success, throws on failure
 *   logout()                  → clears tokens, sets user=null
 *   fetchUserProfile()        → GET /api/auth/profile/, updates user state
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { clearTokens, setTokens, getAccessToken } from '../services/api';

const AuthContext = createContext(null);

const USER_KEY = 'user';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true until we read localStorage

  // -------------------------------------------------------------------------
  // Hydrate user from localStorage on first mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      // Corrupted storage — ignore
    }
    setIsLoading(false);
  }, []);

  // -------------------------------------------------------------------------
  // Internal: update user state + persist to localStorage
  // -------------------------------------------------------------------------
  const _setUser = useCallback((userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  // -------------------------------------------------------------------------
  // login — POST /api/auth/login/ (TokenObtainPairView)
  //          returns { access, refresh }
  //          then fetches user profile and stores tokens + user
  // -------------------------------------------------------------------------
  const login = useCallback(async (username, password) => {
    const { data: tokens } = await api.post('/api/auth/login/', { username, password });
    setTokens(tokens);

    // Immediately fetch the user's profile to populate state
    const { data: profile } = await api.get('/api/auth/profile/');
    // Build a minimal user object from profile + username
    _setUser({ username, ...profile });
    return { tokens, user: { username, ...profile } };
  }, [_setUser]);

  // -------------------------------------------------------------------------
  // register — POST /api/auth/register/
  // -------------------------------------------------------------------------
  const register = useCallback(async ({ username, email, contact_no, password }) => {
    const { data: userData } = await api.post('/api/auth/register/', {
      username,
      email,
      contact_no,
      password,
    });
    return userData; // caller can decide whether to auto-login
  }, []);

  // -------------------------------------------------------------------------
  // logout — POST /api/auth/logout/ (blacklist refresh token) then clear local
  // -------------------------------------------------------------------------
  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh');
    if (refresh) {
      try {
        // Try to blacklist the refresh token. Don't block if it fails.
        await api.post('/api/auth/logout/', { refresh });
      } catch {
        // Ignore — we're clearing local state anyway
      }
    }
    clearTokens();
    _setUser(null);
  }, [_setUser]);

  // -------------------------------------------------------------------------
  // fetchUserProfile — refresh user data from the API (e.g. after profile edit)
  // -------------------------------------------------------------------------
  const fetchUserProfile = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      const { data: profile } = await api.get('/api/auth/profile/');
      const stored = localStorage.getItem(USER_KEY);
      const current = stored ? JSON.parse(stored) : {};
      _setUser({ ...current, ...profile });
    } catch {
      // If the token is expired/invalid the response interceptor will
      // redirect to login and clear state — nothing extra needed here.
    }
  }, [_setUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        fetchUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
};
