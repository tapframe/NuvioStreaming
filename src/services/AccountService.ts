import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from './supabaseClient';

export type AuthUser = {
  id: string;
  email?: string;
  avatarUrl?: string;
  displayName?: string;
};

const USER_SCOPE_KEY = '@user:current';

class AccountService {
  private static instance: AccountService;
  private constructor() {}

  static getInstance(): AccountService {
    if (!AccountService.instance) AccountService.instance = new AccountService();
    return AccountService.instance;
  }

  async signUpWithEmail(email: string, password: string): Promise<{ user?: AuthUser; error?: string }> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    const user = data.user ? { id: data.user.id, email: data.user.email ?? undefined } : undefined;
    if (user) await AsyncStorage.setItem(USER_SCOPE_KEY, user.id);
    // Initialize profile row
    if (user) {
      await supabase.from('user_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id' });
    }
    return { user };
  }

  async signInWithEmail(email: string, password: string): Promise<{ user?: AuthUser; error?: string }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const user = data.user ? { id: data.user.id, email: data.user.email ?? undefined } : undefined;
    if (user) await AsyncStorage.setItem(USER_SCOPE_KEY, user.id);
    return { user };
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    await AsyncStorage.setItem(USER_SCOPE_KEY, 'local');
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) return null;
    // Fetch profile for avatar and display name
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('avatar_url, display_name')
      .eq('user_id', u.id)
      .maybeSingle();
    return { id: u.id, email: u.email ?? undefined, avatarUrl: profile?.avatar_url ?? undefined, displayName: profile?.display_name ?? undefined };
  }

  async updateProfile(partial: { avatarUrl?: string; displayName?: string }): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return 'Not authenticated';
    const { error } = await supabase.from('user_profiles').upsert({
      user_id: userId,
      avatar_url: partial.avatarUrl,
      display_name: partial.displayName,
    }, { onConflict: 'user_id' });
    return error?.message ?? null;
  }

  async getCurrentUserIdScoped(): Promise<string> {
    const user = await this.getCurrentUser();
    if (user?.id) return user.id;
    // Guest scope
    const scope = (await AsyncStorage.getItem(USER_SCOPE_KEY)) || 'local';
    if (!scope) await AsyncStorage.setItem(USER_SCOPE_KEY, 'local');
    return scope || 'local';
  }
}

export const accountService = AccountService.getInstance();
export default accountService;

