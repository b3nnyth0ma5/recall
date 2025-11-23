
/**
 * Web-specific utility to completely disable and cleanup service workers
 * This prevents "newestWorker is null" and other service worker related errors
 */

export const disableServiceWorkersOnWeb = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  // 1. Unregister all existing service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        console.log(`Found ${registrations.length} service worker registrations to unregister`);
        
        registrations.forEach((registration) => {
          registration.unregister()
            .then((success) => {
              if (success) {
                console.log('Service worker unregistered successfully:', registration.scope);
              }
            })
            .catch((error) => {
              console.error('Failed to unregister service worker:', error);
            });
        });
      })
      .catch((error) => {
        console.error('Failed to get service worker registrations:', error);
      });

    // 2. Prevent new service worker registrations
    const originalRegister = navigator.serviceWorker.register;
    navigator.serviceWorker.register = function(...args) {
      console.log('Service worker registration blocked:', args);
      return Promise.reject(new Error('Service workers are disabled'));
    };
  }

  // 3. Disable Expo Updates module if it exists
  if (window.expo?.modules?.ExpoUpdates) {
    try {
      const expoUpdates = window.expo.modules.ExpoUpdates;
      
      // Override update checking methods
      expoUpdates.checkForUpdateAsync = async () => {
        console.log('ExpoUpdates.checkForUpdateAsync disabled');
        return { isAvailable: false };
      };
      
      expoUpdates.fetchUpdateAsync = async () => {
        console.log('ExpoUpdates.fetchUpdateAsync disabled');
        return { isNew: false };
      };
      
      expoUpdates.reloadAsync = async () => {
        console.log('ExpoUpdates.reloadAsync disabled');
        return;
      };

      console.log('Expo Updates module disabled successfully');
    } catch (error) {
      console.error('Failed to disable Expo Updates module:', error);
    }
  }

  // 4. Clear any cached service worker data
  if ('caches' in window) {
    caches.keys()
      .then((cacheNames) => {
        console.log(`Found ${cacheNames.length} caches to delete`);
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        console.log('All caches cleared successfully');
      })
      .catch((error) => {
        console.error('Failed to clear caches:', error);
      });
  }

  // 5. Suppress service worker and update related errors globally
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const errorMessage = args[0]?.toString() || '';
    
    // List of error patterns to suppress
    const suppressPatterns = [
      'sw.js',
      'service worker',
      'ServiceWorker',
      'newestWorker',
      'Error checking for updates',
      'InvalidStateError',
      'SecurityError: Script',
      'load failed',
    ];

    const shouldSuppress = suppressPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );

    if (!shouldSuppress) {
      originalConsoleError(...args);
    }
  };

  // 6. Handle unhandled promise rejections related to service workers
  window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = event.reason?.message || event.reason?.toString() || '';
    
    const suppressPatterns = [
      'sw.js',
      'service worker',
      'ServiceWorker',
      'newestWorker',
      'Error checking for updates',
      'InvalidStateError',
      'SecurityError',
    ];

    const shouldSuppress = suppressPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );

    if (shouldSuppress) {
      event.preventDefault();
      console.log('Suppressed service worker/update error:', errorMessage);
    }
  });

  console.log('Service worker cleanup and disabling complete');
};

// Auto-execute on web
if (typeof window !== 'undefined') {
  disableServiceWorkersOnWeb();
}
