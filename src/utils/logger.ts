class Logger {
  private isEnabled: boolean;

  constructor() {
    // __DEV__ is a global variable in React Native
    this.isEnabled = __DEV__;
  }

  log(...args: any[]) {
    if (this.isEnabled) {
      console.log(...args);
    }
  }

  error(...args: any[]) {
    if (this.isEnabled) {
      console.error(...args);
    }
  }

  warn(...args: any[]) {
    if (this.isEnabled) {
      console.warn(...args);
    }
  }

  info(...args: any[]) {
    if (this.isEnabled) {
      console.info(...args);
    }
  }

  debug(...args: any[]) {
    if (this.isEnabled) {
      console.debug(...args);
    }
  }
}

export const logger = new Logger(); 