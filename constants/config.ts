
/**
 * Application Configuration Constants
 * 
 * This file contains global configuration values used throughout the app.
 */

/**
 * Base URL for the deployed Expo app
 * Used for email redirects and deep linking
 */
export const APP_BASE_URL = 'https://recall.expo.app';

/**
 * Redirect URLs for authentication flows
 */
export const AUTH_REDIRECT_URLS = {
  /**
   * URL for email confirmation redirects
   * Used for: email verification, magic links, password resets
   */
  EMAIL_CONFIRMED: `${APP_BASE_URL}/email-confirmed`,
  
  /**
   * URL for password update redirects
   * Used for: password reset flows
   */
  UPDATE_PASSWORD: `${APP_BASE_URL}/update-password`,
  
  /**
   * URL for password reset requests
   * Used for: initiating password reset
   */
  RESET_PASSWORD: `${APP_BASE_URL}/reset-password`,
};

/**
 * Legacy URLs (for reference only - do not use)
 * @deprecated Use AUTH_REDIRECT_URLS instead
 */
export const LEGACY_URLS = {
  NATIVELY_DEV: 'https://natively.dev',
};
