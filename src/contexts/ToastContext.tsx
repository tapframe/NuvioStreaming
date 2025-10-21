import React, { createContext, useContext, useEffect, useState } from 'react';
import ToastManager from '../components/ui/ToastManager';
import { ToastConfig } from '../components/ui/Toast';
import { toastService } from '../services/toastService';

interface ToastContextType {
  showSuccess: (title: string, message?: string, options?: Partial<ToastConfig>) => string;
  showError: (title: string, message?: string, options?: Partial<ToastConfig>) => string;
  showWarning: (title: string, message?: string, options?: Partial<ToastConfig>) => string;
  showInfo: (title: string, message?: string, options?: Partial<ToastConfig>) => string;
  showCustom: (config: Omit<ToastConfig, 'id'>) => string;
  removeToast: (id: string) => void;
  removeAllToasts: () => void;
  // Convenience methods
  showSaved: () => string;
  showRemoved: () => string;
  showTraktSaved: () => string;
  showTraktRemoved: () => string;
  showNetworkError: () => string;
  showAuthError: () => string;
  showSyncSuccess: (count: number) => string;
  showProgressSaved: () => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastConfig[]>([]);

  useEffect(() => {
    const unsubscribe = toastService.subscribe(setToasts);
    return unsubscribe;
  }, []);

  const contextValue: ToastContextType = {
    showSuccess: toastService.success.bind(toastService),
    showError: toastService.error.bind(toastService),
    showWarning: toastService.warning.bind(toastService),
    showInfo: toastService.info.bind(toastService),
    showCustom: toastService.custom.bind(toastService),
    removeToast: toastService.remove.bind(toastService),
    removeAllToasts: toastService.removeAll.bind(toastService),
    showSaved: toastService.showSaved.bind(toastService),
    showRemoved: toastService.showRemoved.bind(toastService),
    showTraktSaved: toastService.showTraktSaved.bind(toastService),
    showTraktRemoved: toastService.showTraktRemoved.bind(toastService),
    showNetworkError: toastService.showNetworkError.bind(toastService),
    showAuthError: toastService.showAuthError.bind(toastService),
    showSyncSuccess: toastService.showSyncSuccess.bind(toastService),
    showProgressSaved: toastService.showProgressSaved.bind(toastService),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastManager toasts={toasts} onRemoveToast={toastService.remove.bind(toastService)} />
    </ToastContext.Provider>
  );
};

