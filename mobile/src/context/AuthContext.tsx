import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Company, RolePermissions } from '../types';
import { AuthService } from '../api/services';
import { clearAuth } from '../api/client';

interface AuthContextType {
  user: User | null;
  company: Company | null;
  permissions: RolePermissions;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Global Permissions Configuration:
// User explicitly instructed: "ye menu ke permissions rahe sare bas delete ka permission na rahe"
const APP_PERMISSIONS: RolePermissions = {
  canViewSale: true,
  canCreateSale: true,
  canEditSale: true,
  canDeleteSale: false, // NO DELETE PERMISSION

  canViewPurchase: true,
  canCreatePurchase: true,
  canEditPurchase: true,
  canDeletePurchase: false, // NO DELETE PERMISSION

  canViewReceipt: true,
  canCreateReceipt: true,
  canEditReceipt: true,
  canDeleteReceipt: false, // NO DELETE PERMISSION

  canViewPayment: true,
  canCreatePayment: true,
  canEditPayment: true,
  canDeletePayment: false, // NO DELETE PERMISSION

  canViewContra: true,
  canCreateContra: true,
  canEditContra: true,
  canDeleteContra: false, // NO DELETE PERMISSION

  canViewLedger: true,
  canCreateLedger: true,
  canEditLedger: true,
  canDeleteLedger: false, // NO DELETE PERMISSION
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    try {
      const data = await AuthService.getMe();
      if (data && data.user) {
        setUser(data.user);
        setCompany(data.company || null);
      } else {
        setUser(null);
        setCompany(null);
      }
    } catch {
      setUser(null);
      setCompany(null);
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
      if (res.ok) {
        await refreshProfile();
        return true;
      }
      return false;
    } catch (err: any) {
      alert(err.message || 'Login failed');
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
        permissions: APP_PERMISSIONS,
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

