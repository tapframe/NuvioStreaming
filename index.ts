import { registerRootComponent } from 'expo';

// Polyfill for Promise.allSettled (ES2020 feature)
if (!Promise.allSettled) {
  Promise.allSettled = function<T>(promises: Promise<T>[]): Promise<PromiseSettledResult<T>[]> {
    return Promise.all(
      promises.map(promise =>
        Promise.resolve(promise)
          .then(value => ({ status: 'fulfilled' as const, value }))
          .catch(reason => ({ status: 'rejected' as const, reason }))
      )
    );
  };
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
