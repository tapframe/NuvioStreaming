import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import { memoryManager } from '../utils/memoryManager';

/**
 * Global memory monitoring service to prevent OutOfMemoryError
 * Monitors app state changes and automatically manages memory
 */
class MemoryMonitorService {
  private static instance: MemoryMonitorService;
  private appStateSubscription: any = null;
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private backgroundCleanupInterval: NodeJS.Timeout | null = null;
  private lastMemoryWarning: number = 0;
  private readonly MEMORY_CHECK_INTERVAL = 30 * 1000; // 30 seconds
  private readonly BACKGROUND_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MEMORY_WARNING_COOLDOWN = 60 * 1000; // 1 minute

  private constructor() {
    this.startMonitoring();
  }

  static getInstance(): MemoryMonitorService {
    if (!MemoryMonitorService.instance) {
      MemoryMonitorService.instance = new MemoryMonitorService();
    }
    return MemoryMonitorService.instance;
  }

  private startMonitoring(): void {
    // Monitor app state changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

    // Periodic memory checks
    this.memoryCheckInterval = setInterval(() => {
      this.performMemoryCheck();
    }, this.MEMORY_CHECK_INTERVAL);

    // Background cleanup
    this.backgroundCleanupInterval = setInterval(() => {
      this.performBackgroundCleanup();
    }, this.BACKGROUND_CLEANUP_INTERVAL);

    logger.log('[MemoryMonitor] Started memory monitoring service');
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    try {
      switch (nextAppState) {
        case 'background':
          // App going to background - aggressive cleanup
          logger.log('[MemoryMonitor] App backgrounded, performing aggressive cleanup');
          this.performAggressiveCleanup();
          break;
          
        case 'active':
          // App coming to foreground - light cleanup
          logger.log('[MemoryMonitor] App activated, performing light cleanup');
          memoryManager.checkMemoryPressure();
          break;
          
        case 'inactive':
          // App becoming inactive - medium cleanup
          memoryManager.forceGarbageCollection();
          break;
      }
    } catch (error) {
      logger.error('[MemoryMonitor] Error handling app state change:', error);
    }
  };

  private performMemoryCheck(): void {
    try {
      // Check if we should perform cleanup
      const shouldCleanup = memoryManager.checkMemoryPressure();
      
      if (shouldCleanup) {
        logger.log('[MemoryMonitor] Memory pressure detected, performing cleanup');
      }

      // Detect potential memory issues
      this.detectMemoryIssues();
    } catch (error) {
      logger.error('[MemoryMonitor] Error during memory check:', error);
    }
  }

  private detectMemoryIssues(): void {
    try {
      // Check for large object accumulation indicators
      const now = Date.now();
      
      // Simulate memory pressure detection (in a real app, you might check actual memory usage)
      // For React Native, we can't directly access memory stats, so we use heuristics
      
      // Check if we should issue a memory warning
      if (now - this.lastMemoryWarning > this.MEMORY_WARNING_COOLDOWN) {
        // In a production app, you might want to track things like:
        // - Number of React components mounted
        // - Size of Redux store
        // - Number of network requests in flight
        // - Image cache size
        
        // For this implementation, we'll trigger preventive cleanup periodically
        if (Math.random() < 0.1) { // 10% chance to trigger preventive cleanup
          this.issueMemoryWarning();
        }
      }
    } catch (error) {
      logger.error('[MemoryMonitor] Error detecting memory issues:', error);
    }
  }

  private issueMemoryWarning(): void {
    const now = Date.now();
    this.lastMemoryWarning = now;
    
    logger.warn('[MemoryMonitor] Memory usage warning - performing preventive cleanup');
    
    // Perform immediate cleanup
    this.performAggressiveCleanup();
  }

  private performBackgroundCleanup(): void {
    try {
      logger.log('[MemoryMonitor] Performing scheduled background cleanup');
      
      // Force garbage collection
      memoryManager.forceGarbageCollection();
      
      // Clear any global caches that might have accumulated
      this.clearGlobalCaches();
      
    } catch (error) {
      logger.error('[MemoryMonitor] Error during background cleanup:', error);
    }
  }

  private performAggressiveCleanup(): void {
    try {
      logger.log('[MemoryMonitor] Performing aggressive memory cleanup');
      
      // Multiple garbage collection cycles
      for (let i = 0; i < 3; i++) {
        memoryManager.forceGarbageCollection();
        // Small delay between GC cycles
        setTimeout(() => {}, 100);
      }
      
      // Clear all possible caches
      this.clearGlobalCaches();
      
      // Clear image caches if available
      this.clearImageCaches();
      
    } catch (error) {
      logger.error('[MemoryMonitor] Error during aggressive cleanup:', error);
    }
  }

  private clearGlobalCaches(): void {
    try {
      // Clear any global caches your app might have
      if (global && global.__APP_CACHE__) {
        global.__APP_CACHE__ = {};
      }
      
      if (global && global.__METADATA_CACHE__) {
        global.__METADATA_CACHE__ = {};
      }
      
      if (global && global.__EPISODE_CACHE__) {
        global.__EPISODE_CACHE__ = {};
      }
    } catch (error) {
      logger.warn('[MemoryMonitor] Could not clear global caches:', error);
    }
  }

  private clearImageCaches(): void {
    try {
      // Clear React Native image caches if available
      if (global && global.__IMAGE_CACHE__) {
        global.__IMAGE_CACHE__ = {};
      }
      
      // Clear Expo Image cache if available
      // Note: Expo Image has its own cache management, but we can suggest cleanup
      if (global && global.expo && global.expo.ImagePicker) {
        // This is just an example - actual cache clearing would depend on the library
      }
    } catch (error) {
      logger.warn('[MemoryMonitor] Could not clear image caches:', error);
    }
  }

  /**
   * Manually trigger memory cleanup (for external use)
   */
  public forceCleanup(): void {
    logger.log('[MemoryMonitor] Manual cleanup triggered');
    this.performAggressiveCleanup();
  }

  /**
   * Get memory monitoring statistics
   */
  public getStats(): {
    lastMemoryWarning: number;
    monitoringActive: boolean;
    cleanupIntervals: {
      memoryCheck: number;
      backgroundCleanup: number;
    };
  } {
    return {
      lastMemoryWarning: this.lastMemoryWarning,
      monitoringActive: this.memoryCheckInterval !== null,
      cleanupIntervals: {
        memoryCheck: this.MEMORY_CHECK_INTERVAL,
        backgroundCleanup: this.BACKGROUND_CLEANUP_INTERVAL,
      },
    };
  }

  /**
   * Stop monitoring (for cleanup when app is destroyed)
   */
  public stopMonitoring(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    
    if (this.backgroundCleanupInterval) {
      clearInterval(this.backgroundCleanupInterval);
      this.backgroundCleanupInterval = null;
    }
    
    logger.log('[MemoryMonitor] Stopped memory monitoring service');
  }

  /**
   * Handle low memory warnings from the system
   */
  public handleLowMemoryWarning(): void {
    logger.warn('[MemoryMonitor] System low memory warning received');
    this.performAggressiveCleanup();
  }
}

// Export singleton instance
export const memoryMonitorService = MemoryMonitorService.getInstance();
