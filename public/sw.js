// Hezalli service worker — Web Push for buyers, sellers, and drivers.
// Shows an incoming push (with a buzz on devices that support it — the
// notification's sound itself is the OS/browser default) and focuses (or
// opens) the app on click.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Hezalli", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Hezalli";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.svg",
    tag: data.tag || undefined,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab if we have one; otherwise open a new one.
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
