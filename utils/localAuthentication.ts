// Stub for expo-local-authentication — replace with real package once installed via EAS build
// This prevents Metro from crashing when the native module isn't in node_modules yet.

let LocalAuthentication: any;

try {
  LocalAuthentication = require('expo-local-authentication');
} catch {
  // Package not installed — provide no-op stubs
  LocalAuthentication = {
    hasHardwareAsync: async () => false,
    isEnrolledAsync: async () => false,
    authenticateAsync: async (_opts?: any) => ({ success: false, error: 'not_available' }),
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  };
}

export const hasHardwareAsync = LocalAuthentication.hasHardwareAsync;
export const isEnrolledAsync = LocalAuthentication.isEnrolledAsync;
export const authenticateAsync = LocalAuthentication.authenticateAsync;
export const AuthenticationType = LocalAuthentication.AuthenticationType;
export default LocalAuthentication;
