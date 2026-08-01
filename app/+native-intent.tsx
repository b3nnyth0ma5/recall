export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  console.log('[NativeIntent] Intercepting path:', path);

  // Share extension deep link
  if (path.includes('share-intent')) {
    console.log('[NativeIntent] Redirecting share-intent to /create-recall-from-share');
    return '/create-recall-from-share';
  }

  // Normalise: strip leading slash so both "/foo" and "foo" match the same way
  const normalised = path.startsWith('/') ? path.slice(1) : path;

  // Siri App Intent — Search: recall://search?q=chicken+curry
  if (normalised.startsWith('search') && normalised.includes('q=')) {
    console.log('[NativeIntent] Redirecting Siri search intent to /search:', path);
    return '/' + normalised + '&autoSearch=true';
  }

  // Siri App Intent — Create: recall://create-recall
  if (normalised.startsWith('create-recall')) {
    console.log('[NativeIntent] Redirecting Siri create intent to home with openCreate=true');
    return '/?openCreate=true';
  }

  return path;
}
