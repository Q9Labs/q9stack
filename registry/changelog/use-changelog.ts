import * as React from "react";

import { compareVersions, type Changelog } from "@/lib/changelog";

const storageKey = "q9:changelog:last-seen";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readLastSeen() {
  return window.localStorage.getItem(storageKey);
}

// On the server the last seen version is unknown, so nothing counts as unseen.
function readLastSeenOnServer() {
  return undefined;
}

export function useChangelog(data: Changelog) {
  const latestVersion = data.releases[0]?.version;
  const lastSeenVersion = React.useSyncExternalStore(subscribe, readLastSeen, readLastSeenOnServer);

  const hasUnseen =
    latestVersion !== undefined &&
    lastSeenVersion !== undefined &&
    (lastSeenVersion === null || compareVersions(latestVersion, lastSeenVersion) > 0);

  const markSeen = React.useCallback(() => {
    if (latestVersion === undefined) return;
    window.localStorage.setItem(storageKey, latestVersion);
    // The storage event only fires in other tabs, so notify this one too.
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
  }, [latestVersion]);

  return { hasUnseen, latestVersion, markSeen };
}
