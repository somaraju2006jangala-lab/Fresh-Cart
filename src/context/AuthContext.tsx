import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Customer, CustomerAddress, CustomerOrder } from '../types';
import {
  getCurrentCustomer,
  loginCustomer,
  registerCustomer,
  logoutCustomer,
  updateCustomerProfile,
  addSavedAddress,
  removeSavedAddress,
  getCustomerOrders,
  saveOrderForCustomer,
  requestPasswordReset,
  initializeAuthStore,
  RegisterPayload,
} from '../services/authService';

interface AuthContextType {
  currentUser: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  orders: CustomerOrder[];
  login: (identifier: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<Customer, 'name' | 'phone' | 'address'>>) => void;
  addAddress: (address: Omit<CustomerAddress, 'id'>) => void;
  removeAddress: (addressId: string) => void;
  refreshOrders: () => void;
  addOrder: (order: CustomerOrder) => void;
  requestReset: (email: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);

  const refreshOrders = useCallback(() => {
    const customerOrders = getCustomerOrders(currentUser?.id);
    setOrders(customerOrders);
  }, [currentUser?.id]);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeAuthStore();
        const user = getCurrentCustomer();
        if (user) {
          setCurrentUser(user);
          setOrders(getCustomerOrders(user.id));
        }
      } catch (err) {
        console.error('Error during Auth initialization:', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const login = async (identifier: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await loginCustomer(identifier, pass);
      if (res.success && res.customer) {
        setCurrentUser(res.customer);
        setOrders(getCustomerOrders(res.customer.id));
        return { success: true };
      }
      return { success: false, error: res.error || 'Login failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: RegisterPayload) => {
    setIsLoading(true);
    try {
      const res = await registerCustomer(payload);
      if (res.success && res.customer) {
        setCurrentUser(res.customer);
        setOrders(getCustomerOrders(res.customer.id));
        return { success: true };
      }
      return { success: false, error: res.error || 'Registration failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    logoutCustomer();
    setCurrentUser(null);
    setOrders([]);
  };

  const updateProfile = (updates: Partial<Pick<Customer, 'name' | 'phone' | 'address'>>) => {
    if (!currentUser) return;
    const updated = updateCustomerProfile(currentUser.id, updates);
    if (updated) {
      setCurrentUser(updated);
    }
  };

  const addAddress = (address: Omit<CustomerAddress, 'id'>) => {
    if (!currentUser) return;
    const updated = addSavedAddress(currentUser.id, address);
    if (updated) {
      setCurrentUser(updated);
    }
  };

  const removeAddress = (addressId: string) => {
    if (!currentUser) return;
    const updated = removeSavedAddress(currentUser.id, addressId);
    if (updated) {
      setCurrentUser(updated);
    }
  };

  const addOrder = (order: CustomerOrder) => {
    saveOrderForCustomer(order);
    refreshOrders();
  };

  const requestReset = async (email: string) => {
    return await requestPasswordReset(email);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isLoading,
        orders,
        login,
        register,
        logout,
        updateProfile,
        addAddress,
        removeAddress,
        refreshOrders,
        addOrder,
        requestReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
