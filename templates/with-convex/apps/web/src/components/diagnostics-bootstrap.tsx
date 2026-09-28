import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { auth } from "../lib/auth-client.js";
import { captureNavigation, startDiagnostics } from "../lib/diagnostics.js";

export function DiagnosticsBootstrap() {
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    let stopped = false;
    let stop: (() => void) | undefined;
    void auth.getSession().then((result) => {
      if (stopped || !result.ok || result.value.status !== "authenticated") return;
      stop = startDiagnostics();
      captureNavigation(window.location.pathname);
    });
    return () => {
      stopped = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    captureNavigation(pathname);
  }, [pathname]);
  return null;
}
