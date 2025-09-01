import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingContextValue {
  isHomeLoading: boolean;
  setHomeLoading: (loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextValue | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isHomeLoading, setIsHomeLoading] = useState(true);

  const value: LoadingContextValue = {
    isHomeLoading,
    setHomeLoading: setIsHomeLoading,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = (): LoadingContextValue => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};
