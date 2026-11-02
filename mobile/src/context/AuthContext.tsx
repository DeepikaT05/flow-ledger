import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { User, Company, RolePermissions } from '../types';
import { AuthService } from '../api/services';
import { clearAuth, setAuthToken, getAuthToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  company: Company | null;
  permissions: RolePermissions;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

function computeAppPermissions(appPerms?: Record<string, boolean>): RolePermissions {
  const p = appPerms || {
    sale: true,
    purchase: true,
    receipt: true,
    payment: true,
    contra: true,
    ledger: true,
    delete: false,
  };
  return {
    canViewSale: p.sale !== false,
    canCreateSale: p.sale !== false,
    canEditSale: p.sale !== false,
    canDeleteSale: !!p.delete,

    canViewPurchase: p.purchase !== false,
    canCreatePurchase: p.purchase !== false,
    canEditPurchase: p.purchase !== false,
    canDeletePurchase: !!p.delete,

    canViewReceipt: p.receipt !== false,
    canCreateReceipt: p.receipt !== false,
    canEditReceipt: p.receipt !== false,
    canDeleteReceipt: !!p.delete,

    canViewPayment: p.payment !== false,
    canCreatePayment: p.payment !== false,
    canEditPayment: p.payment !== false,
    canDeletePayment: !!p.delete,

    canViewContra: p.contra !== false,
    canCreateContra: p.contra !== false,
    canEditContra: p.contra !== false,
    canDeleteContra: !!p.delete,

    canViewLedger: p.ledger !== false,
    canCreateLedger: p.ledger !== false,
    canEditLedger: p.ledger !== false,
    canDeleteLedger: !!p.delete,
  };
}

const DEFAULT_PERMISSIONS: RolePermissions = computeAppPermissions();

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        setUser(null);
        setCompany(null);
        setPermissions(DEFAULT_PERMISSIONS);
        setIsLoading(false);
        return;
      }
      const data = await AuthService.getMe();
      if (data && data.name) {
        setUser({
          id: data.id,
          username: data.name,
          role: data.role,
          name: data.name,
          access_type: data.access_type,
          app_perms: data.app_perms,
        } as any);

        setPermissions(computeAppPermissions(data.app_perms));

        try {
          const comps = await AuthService.getCompanies();
          if (Array.isArray(comps) && comps.length > 0) {
            const active = comps.find((c: any) => c.id === data.company_id) || comps[0];
            setCompany(active);
          }
        } catch {}
      } else {
        setUser(null);
        setCompany(null);
        setPermissions(DEFAULT_PERMISSIONS);
      }
    } catch {
      setUser(null);
      setCompany(null);
      setPermissions(DEFAULT_PERMISSIONS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, []);

  const login = async (u: string, p: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await AuthService.login(u, p);
      if (res && res.token) {
        await setAuthToken(res.token);
        if (res.app_perms) {
          setPermissions(computeAppPermissions(res.app_perms));
        }
        try {
          await AuthService.selectCompany(res.company_id || 1);
        } catch {}
        await refreshProfile();
        return true;
      }
      Alert.alert('Login Failed', 'Invalid username or password');
      return false;
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid username or password');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
    } catch {}
    await clearAuth();
    setUser(null);
    setCompany(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        permissions,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

