'use client';

import { createContext, useContext } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ user, children }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useAuth must be used inside AuthProvider');
  return user;
}
