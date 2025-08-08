import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import accountService, { AuthUser } from '../services/AccountService';
import supabase from '../services/supabaseClient';
import syncService from '../services/SyncService';

type AccountContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session
    (async () => {
      const u = await accountService.getCurrentUser();
      setUser(u);
      setLoading(false);
      syncService.init();
      if (u) {
        await syncService.migrateLocalScopeToUser();
        await syncService.subscribeRealtime();
        await Promise.all([
          syncService.fullPull(),
          syncService.fullPush(),
        ]);
      }
    })();

    // Auth state listener
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null;
      setUser(u);
      if (u) {
        await syncService.migrateLocalScopeToUser();
        await syncService.subscribeRealtime();
        await Promise.all([
          syncService.fullPull(),
          syncService.fullPush(),
        ]);
      } else {
        syncService.unsubscribeRealtime();
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
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

