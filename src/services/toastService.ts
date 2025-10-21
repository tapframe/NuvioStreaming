import { ToastConfig } from '../components/ui/Toast';

class ToastService {
  private static instance: ToastService;
  private toasts: ToastConfig[] = [];
  private listeners: Array<(toasts: ToastConfig[]) => void> = [];
  private idCounter = 0;

  private constructor() {}

  static getInstance(): ToastService {
    if (!ToastService.instance) {
      ToastService.instance = new ToastService();
    }
    return ToastService.instance;
  }

  private generateId(): string {
    return `toast_${++this.idCounter}_${Date.now()}`;
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.toasts]));
  }

  subscribe(listener: (toasts: ToastConfig[]) => void): () => void {
    this.listeners.push(listener);
    // Immediately call with current toasts
    listener([...this.toasts]);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private addToast(config: Omit<ToastConfig, 'id'>): string {
    const id = this.generateId();
    const toast: ToastConfig = {
      id,
      duration: 4000,
      position: 'top',
      ...config,
    };

    this.toasts.push(toast);
    this.notifyListeners();
    return id;
  }

  success(title: string, message?: string, options?: Partial<ToastConfig>): string {
    return this.addToast({
      type: 'success',
      title,
      message,
      ...options,
    });
  }

  error(title: string, message?: string, options?: Partial<ToastConfig>): string {
    return this.addToast({
      type: 'error',
      title,
      message,
      duration: 6000, // Longer duration for errors
      ...options,
    });
  }

  warning(title: string, message?: string, options?: Partial<ToastConfig>): string {
    return this.addToast({
      type: 'warning',
      title,
      message,
      ...options,
    });
  }

  info(title: string, message?: string, options?: Partial<ToastConfig>): string {
    return this.addToast({
      type: 'info',
      title,
      message,
      ...options,
    });
  }

  custom(config: Omit<ToastConfig, 'id'>): string {
    return this.addToast(config);
  }

  remove(id: string): void {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.notifyListeners();
  }

  removeAll(): void {
    this.toasts = [];
    this.notifyListeners();
  }

  // Convenience methods for common use cases
  showSaved(): string {
    return this.success('Saved', 'Added to your library');
  }

  showRemoved(): string {
    return this.info('Removed', 'Removed from your library');
  }

  showTraktSaved(): string {
    return this.success('Saved to Trakt', 'Added to watchlist and library');
  }

  showTraktRemoved(): string {
    return this.info('Removed from Trakt', 'Removed from watchlist');
  }

  showNetworkError(): string {
    return this.error(
      'Network Error',
      'Please check your internet connection',
      { duration: 8000 }
    );
  }

  showAuthError(): string {
    return this.error(
      'Authentication Error',
      'Please log in to Trakt again',
      { duration: 8000 }
    );
  }

  showSyncSuccess(count: number): string {
    return this.success(
      'Sync Complete',
      `Synced ${count} items to Trakt`,
      { duration: 3000 }
    );
  }

  showProgressSaved(): string {
    return this.success('Progress Saved', 'Your watch progress has been synced');
  }
}

export const toastService = ToastService.getInstance();
export default toastService;

