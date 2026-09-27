import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { runtimeAppEnvironment } from "../../env.js";

export const Route = createFileRoute("/__preview")({
  beforeLoad: () => {
    if (runtimeAppEnvironment() === "prod") {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirects use thrown Redirect values.
      throw redirect({ href: "/" });
    }
  },
  component: () => <Outlet />,
});
