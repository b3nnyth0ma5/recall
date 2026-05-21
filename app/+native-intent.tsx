export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  console.log('[NativeIntent] Intercepting path:', path);
  if (path.includes('share-intent')) {
    console.log('[NativeIntent] Redirecting share-intent to /create-recall-from-share');
    return '/create-recall-from-share';
  }
  return path;
}
