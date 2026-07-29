export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  console.log('[NativeIntent] Intercepting path:', path);

  // Share extension deep link
  if (path.includes('share-intent')) {
    console.log('[NativeIntent] Redirecting share-intent to /create-recall-from-share');
    return '/create-recall-from-share';
  }

  // Siri App Intent search: recall://search?q=chicken+curry
  // Expo Router strips the scheme, leaving /search?q=...
  if (path.startsWith('/search') && path.includes('q=')) {
    console.log('[NativeIntent] Redirecting Siri search intent to /search:', path);
    return path;
  }

  return path;
}
