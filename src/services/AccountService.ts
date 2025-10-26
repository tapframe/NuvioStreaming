import { mmkvStorage } from './mmkvStorage';

export type AuthUser = {
  id: string;
  email?: string;
  avatarUrl?: string;
  displayName?: string;
};

const USER_DATA_KEY = '@user:data';
const USER_SCOPE_KEY = '@user:current';

class AccountService {
  private static instance: AccountService;
  private constructor() {}

  static getInstance(): AccountService {
    if (!AccountService.instance) AccountService.instance = new AccountService();
    return AccountService.instance;
  }

  async signUpWithEmail(email: string, password: string): Promise<{ user?: AuthUser; error?: string }> {
    // Since signup is disabled, always return error
    return { error: 'Sign up is currently disabled due to upcoming system changes' };
  }

  async signInWithEmail(email: string, password: string): Promise<{ user?: AuthUser; error?: string }> {
    // Since signin is disabled, always return error
    return { error: 'Authentication is currently disabled' };
  }

  async signOut(): Promise<void> {
    await mmkvStorage.removeItem(USER_DATA_KEY);
    await mmkvStorage.setItem(USER_SCOPE_KEY, 'local');
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const userData = await mmkvStorage.getItem(USER_DATA_KEY);
      if (!userData) return null;
      return JSON.parse(userData);
    } catch {
      return null;
    }
  }

  async updateProfile(partial: { avatarUrl?: string; displayName?: string }): Promise<string | null> {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) return 'Not authenticated';

      const updatedUser = { ...currentUser, ...partial };
      await mmkvStorage.setItem(USER_DATA_KEY, JSON.stringify(updatedUser));
      return null;
    } catch {
      return 'Failed to update profile';
    }
  }

  async getCurrentUserIdScoped(): Promise<string> {
    const user = await this.getCurrentUser();
    if (user?.id) return user.id;
    // Guest scope
    const scope = (await mmkvStorage.getItem(USER_SCOPE_KEY)) || 'local';
    if (!scope) await mmkvStorage.setItem(USER_SCOPE_KEY, 'local');
    return scope || 'local';
  }
}

export const accountService = AccountService.getInstance();
export default accountService;

