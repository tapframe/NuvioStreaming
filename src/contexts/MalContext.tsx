import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import { malService, MalUser } from '../services/malService';
import { logger } from '../utils/logger';

interface MalContextProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  userProfile: MalUser | null;
  refreshAuthStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const MalContext = createContext<MalContextProps | undefined>(undefined);

export function MalProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<MalUser | null>(null);

  const refreshAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const authenticated = await malService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        try {
          const profile = await malService.getUserProfile();
          setUserProfile(profile);
        } catch (error) {
          logger.error('[MalContext] Failed to fetch user profile:', error);
          // If profile fetch fails, we might still be authenticated but with token issues?
          // For now, keep authenticated true but profile null or old
        }
      } else {
        setUserProfile(null);
      }
    } catch (error) {
      logger.error('[MalContext] Error checking auth status:', error);
      setIsAuthenticated(false);
      setUserProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await malService.logout();
      setIsAuthenticated(false);
      setUserProfile(null);
    } catch (error) {
      logger.error('[MalContext] Error logging out:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuthStatus();
  }, [refreshAuthStatus]);

  return (
    <MalContext.Provider value={{
      isAuthenticated,
      isLoading,
      userProfile,
      refreshAuthStatus,
      logout
    }}>
      {children}
    </MalContext.Provider>
  );
}

export function useMalContext() {
  const context = useContext(MalContext);
  if (context === undefined) {
    throw new Error('useMalContext must be used within a MalProvider');
  }
  return context;
}
