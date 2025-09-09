import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import accountService, { AuthUser } from '../services/AccountService';
import supabase from '../services/supabaseClient';
import syncService from '../services/SyncService';

type AccountContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  updateProfile: (partial: { avatarUrl?: string; displayName?: string }) => Promise<string | null>;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session (load full profile)
    // Defer heavy work until after initial interactions to reduce launch CPU spike
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        const u = await accountService.getCurrentUser();
        setUser(u);
        setLoading(false);
        // Stage sync operations to avoid blocking the JS thread
        syncService.init();
        if (u) {
          try {
            await syncService.migrateLocalScopeToUser();
            // Longer yield to event loop to reduce CPU pressure
            await new Promise(resolve => setTimeout(resolve, 100));
            await syncService.subscribeRealtime();
            await new Promise(resolve => setTimeout(resolve, 100));
            // Pull first to hydrate local state, then push to avoid wiping server with empty local
            await syncService.fullPull();
            await new Promise(resolve => setTimeout(resolve, 100));
            await syncService.fullPush();
          } catch {}
        }
      })();
    });

    // Auth state listener
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const fullUser = session?.user ? await accountService.getCurrentUser() : null;
      setUser(fullUser);
      if (fullUser) {
        await syncService.migrateLocalScopeToUser();
        await syncService.subscribeRealtime();
        // Pull first to hydrate local state, then push to avoid wiping server with empty local
        await syncService.fullPull();
        await syncService.fullPush();
      } else {
        syncService.unsubscribeRealtime();
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
      task.cancel();
    };
  }, []);

  const value = useMemo<AccountContextValue>(() => ({
    user,
    loading,
    signIn: async (email: string, password: string) => {
      const { error } = await accountService.signInWithEmail(email, password);
      return error || null;
    },
    signUp: async (email: string, password: string) => {
      const { error } = await accountService.signUpWithEmail(email, password);
      return error || null;
    },
    signOut: async () => {
      await accountService.signOut();
      setUser(null);
    },
    updateProfile: async (partial) => {
      const err = await accountService.updateProfile(partial);
      if (!err) {
        // Refresh user from server to pick updated fields
        const u = await accountService.getCurrentUser();
        setUser(u);
      }
      return err;
    }
  }), [user, loading]);

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = (): AccountContextValue => {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
};

export default AccountContext;

