/* RIGHTNOW service worker — Web Push display + click routing. */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { title: 'RIGHTNOW', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'RIGHTNOW';
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/';
  if (data.type === 'spark') url = '/map';
  else if (data.type === 'match' && data.matchId) url = `/match/${data.matchId}`;
  else if (data.type === 'safety_checkin' && data.matchId) url = `/meetup/${data.matchId}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
