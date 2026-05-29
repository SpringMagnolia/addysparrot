export type Route =
  | { name: 'home' }
  | { name: 'detail'; id: string }
  | { name: 'review' }
  | { name: 'reviewAll' }
  | { name: 'reviewSession' }
  | { name: 'settings' };

export function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/video/')) {
    return { name: 'detail', id: decodeURIComponent(hash.replace('/video/', '')) };
  }
  if (hash === '/review') {
    return { name: 'review' };
  }
  if (hash === '/review/all') {
    return { name: 'reviewAll' };
  }
  if (hash === '/review/session') {
    return { name: 'reviewSession' };
  }
  if (hash === '/settings') {
    return { name: 'settings' };
  }
  return { name: 'home' };
}

export function navigate(route: Route) {
  if (route.name === 'home') window.location.hash = '/';
  if (route.name === 'review') window.location.hash = '/review';
  if (route.name === 'reviewAll') window.location.hash = '/review/all';
  if (route.name === 'reviewSession') window.location.hash = '/review/session';
  if (route.name === 'settings') window.location.hash = '/settings';
  if (route.name === 'detail') window.location.hash = `/video/${encodeURIComponent(route.id)}`;
}
