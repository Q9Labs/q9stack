/// <reference types="vite/client" />
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "@q9labsai/ui/tokens.css";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { createRootRoute } from "@tanstack/react-router";

import { LocalizedShell } from "../components/localized-shell.js";
import { RootDocument } from "../components/root-document.js";
import { LocaleProvider } from "../i18n/locale-provider.js";
import { authClient } from "../lib/auth-client.js";
import { convexClient } from "../lib/convex.js";

import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "__APP_NAME__" },
      { name: "application-name", content: "__APP_NAME__" },
      { name: "description", content: "A q9labs project starter." },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={authClient}>
      <LocaleProvider>
        <LocalizedShell />
      </LocaleProvider>
    </ConvexBetterAuthProvider>
  );
}
