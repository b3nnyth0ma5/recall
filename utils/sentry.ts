
import * as Sentry from '@sentry/react-native';

/**
 * Initialize Sentry for application performance monitoring, error tracking, and session replay
 * Following https://docs.sentry.io/platforms/react-native/manual-setup/expo/
 */
export function initializeSentry() {
  const sentryDsn = 'https://4c2b3b4d11570a614f07073e05494eb7@o4510542497447936.ingest.de.sentry.io/4510542503280720';

  console.log('[Sentry] Initializing Sentry with DSN...');

  try {
    Sentry.init({
      dsn: sentryDsn,
      
      // Enable automatic tracing
      enableAutoSessionTracking: true,
      
      // Session tracking interval
      sessionTrackingIntervalMillis: 10000,

      // Performance Monitoring - Capture 100% of transactions in development, 10% in production
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,

      // Session Replay - Sample 10% of sessions, 100% of error sessions
      replaysSessionSampleRate: __DEV__ ? 1.0 : 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Enable native crash handling
      enableNative: true,
      enableNativeCrashHandling: true,

      // Enable automatic breadcrumbs
      enableAutoPerformanceTracing: true,

      // Attach stack traces to all messages
      attachStacktrace: true,

      // Maximum number of breadcrumbs
      maxBreadcrumbs: 100,

      // Environment
      environment: __DEV__ ? 'development' : 'production',

      // Enable debug mode in development
      debug: __DEV__,

      // Integrations for React Native
      integrations: [
        // Mobile Replay integration for session replay
        Sentry.mobileReplayIntegration({
          maskAllText: false,
          maskAllImages: false,
        }),
      ],

      // Before send hook - can be used to filter or modify events
      beforeSend(event, hint) {
        // Log events in development
        if (__DEV__) {
          console.log('[Sentry] Capturing event:', event.event_id, event.message || event.exception);
        }
        
        return event;
      },

      // Before breadcrumb hook - can be used to filter or modify breadcrumbs
      beforeBreadcrumb(breadcrumb, hint) {
        return breadcrumb;
      },
    });

    console.log('[Sentry] Sentry initialized successfully');
  } catch (error) {
    console.error('[Sentry] Failed to initialize Sentry:', error);
  }
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, any>) {
  console.error('[Sentry] Capturing exception:', error);
  
  if (context) {
    Sentry.setContext('custom', context);
  }
  
  Sentry.captureException(error);
}

/**
 * Capture a message manually
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  console.log(`[Sentry] Capturing message (${level}):`, message);
  
  if (context) {
    Sentry.setContext('custom', context);
  }
  
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id: string; email?: string; username?: string } | null) {
  if (user) {
    console.log('[Sentry] Setting user context:', user.id);
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } else {
    console.log('[Sentry] Clearing user context');
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb manually
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: Sentry.SeverityLevel;
  data?: Record<string, any>;
}) {
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Set a tag for filtering events in Sentry
 */
export function setTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

/**
 * Set extra context data
 */
export function setExtra(key: string, value: any) {
  Sentry.setExtra(key, value);
}

/**
 * Wrap a function with error boundary
 */
export function withErrorBoundary<T extends (...args: any[]) => any>(
  fn: T,
  options?: {
    fallback?: (...args: Parameters<T>) => ReturnType<T>;
    onError?: (error: Error) => void;
  }
): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (error) {
      console.error('[Sentry] Error in wrapped function:', error);
      captureException(error as Error);
      
      if (options?.onError) {
        options.onError(error as Error);
      }
      
      if (options?.fallback) {
        return options.fallback(...args);
      }
      
      throw error;
    }
  }) as T;
}
