import React, { createContext, useContext, useState, useCallback } from 'react';

interface CatalogContextType {
  lastUpdate: number;
  refreshCatalogs: () => void;
}

const CatalogContext = createContext<CatalogContextType>({
  lastUpdate: Date.now(),
  refreshCatalogs: () => {},
});

export const useCatalogContext = () => useContext(CatalogContext);

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refreshCatalogs = useCallback(() => {
    setLastUpdate(Date.now());
  }, []);

  return (
    <CatalogContext.Provider value={{ lastUpdate, refreshCatalogs }}>
      {children}
    </CatalogContext.Provider>
  );
}; 