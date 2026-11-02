import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { User, Company, ModuleKey } from '../types';
import { AuthService, Session } from '../api/services';
import { clearAuth, setAuthToken, getAuthToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  company: Company | null;
  companies: Company[];
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  selectCompany: (c: Company) => Promise<void>;
  /** Leave the open company and go back to the company list. */
  changeCompany: () => void;
  refreshProfile: () => Promise<void>;
  /** Server permission check: true when the role holds any of `perms` (SuperAdmin holds all). */
  can: (perms: string[]) => boolean;
  /** Module switched on for this user in SuperAdmin ▸ APK permissions. */
  canModule: (m: ModuleKey) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const userOf = (s: Session): User => ({
  id: s.id, username: s.name, name: s.name, role: s.role, is_super: !!s.is_super,
  access_type: s.access_type, app_perms: s.app_perms, perms: s.perms ?? [],
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reset = () => { setUser(null); setCompany(null); setCompanies([]); };

  const loadSession = async (s: Session) => {
    setUser(userOf(s));
    const list = await AuthService.getCompanies().catch(() => [] as Company[]);
    setCompanies(list);
    const open = list.find((c) => c.id === s.company_id);
    if (open) setCompany(open);
    else if (list.length === 1) {
      await AuthService.selectCompany(list[0].id);
      setCompany(list[0]);
    } else setCompany(null);   // more than one: the user picks on CompanySelect
  };

  const refreshProfile = async () => {
    try {
      if (!(await getAuthToken())) { reset(); return; }
      const me = await AuthService.getMe();
      if (me?.name) await loadSession(me);
      else reset();
    } catch {
      reset();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { refreshProfile(); }, []);

  const login = async (u: string, p: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await AuthService.login(u, p);
      if (!res?.token) { Alert.alert('Login Failed', 'Invalid username or password'); return false; }
      await setAuthToken(res.token);
      await loadSession(res);
      return true;
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid username or password');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try { await AuthService.logout(); } catch { /* session may already be gone */ }
    await clearAuth();
    reset();
  };

  const selectCompany = async (c: Company) => {
    const open = await AuthService.selectCompany(c.id);
    setCompany({ ...c, ...(open && typeof open === 'object' ? open : {}) });
  };

  const can = useCallback((perms: string[]) => {
    if (!user) return false;
    if (perms.includes('feature.delete') && !user.app_perms?.delete) return false;
    if (perms.some((p) => p.includes('.modify')) && user.app_perms?.edit === false) return false;
    if (user.is_super) return true;
    return perms.some((p) => user.perms?.includes(p));
  }, [user]);

  const canModule = useCallback((m: ModuleKey) => user?.app_perms?.[m] !== false, [user]);

  return (
    <AuthContext.Provider value={{
      user, company, companies, isLoading, login, logout, selectCompany,
      changeCompany: () => setCompany(null), refreshProfile, can, canModule,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
