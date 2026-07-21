// Hezalli service worker — Web Push for the driver app.
// Shows an incoming push and focuses (or opens) the app on click.

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
    icon: "/driver-icon.svg",
    tag: data.tag || undefined,
    data: { url: data.url || "/driver" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/driver";
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
