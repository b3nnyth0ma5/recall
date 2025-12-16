
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Initialize Sentry for application performance monitoring, error tracking, and session replay
 * This should be called as early as possible in the application lifecycle
 */
export function initializeSentry() {
  const sentryDsn = Constants.expoConfig?.extra?.SENTRY_INGEST_DSN || process.env.SENTRY_INGEST_DSN;

  if (!sentryDsn) {
    console.warn('[Sentry] SENTRY_INGEST_DSN not found in environment variables. Sentry will not be initialized.');
    return;
  }

  console.log('[Sentry] Initializing Sentry with DSN...');

  try {
    Sentry.init({
      dsn: sentryDsn,
      
      // Setting this option to true will send default PII data to Sentry
      // For example, automatic IP address collection on events
      sendDefaultPii: true,

      // Enable automatic tracing
      enableAutoSessionTracking: true,
      
      // Session tracking
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

      // Integrations
      integrations: [
        // React Native Tracing integration for performance monitoring
        new Sentry.ReactNativeTracing({
          // Enable automatic tracing of user interactions
          enableUserInteractionTracing: true,
          
          // Enable automatic tracing of app start
          enableAppStartTracking: true,
          
          // Enable automatic tracing of slow/frozen frames
          enableStallTracking: true,
          
          // Trace propagation targets - adjust based on your API endpoints
          tracePropagationTargets: [
            'localhost',
            /^https:\/\/.*\.supabase\.co/,
            /^https:\/\/natively\.dev/,
          ],
        }),
        
        // Session Replay integration for React Native
        new Sentry.MobileReplayIntegration({
          // Mask all text content for privacy
          maskAllText: false,
          
          // Mask all images for privacy
          maskAllImages: false,
          
          // Block all media (audio/video)
          blockAllMedia: true,
        }),
      ],

      // Before send hook - can be used to filter or modify events
      beforeSend(event, hint) {
        // Log events in development
        if (__DEV__) {
          console.log('[Sentry] Capturing event:', event.event_id, event.message || event.exception);
        }
        
        // Filter out events if needed
        // For example, you might want to filter out certain errors
        
        return event;
      },

      // Before breadcrumb hook - can be used to filter or modify breadcrumbs
      beforeBreadcrumb(breadcrumb, hint) {
        // Filter out noisy breadcrumbs if needed
        // For example, you might want to filter out console.log breadcrumbs
        
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
 * Start a transaction for performance monitoring
 */
export function startTransaction(name: string, op: string) {
  const transaction = Sentry.startTransaction({
    name,
    op,
  });
  
  return transaction;
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
