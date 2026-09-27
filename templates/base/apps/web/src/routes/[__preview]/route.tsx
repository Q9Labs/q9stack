import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { runtimeAppEnvironment } from "../../env.js";

export const Route = createFileRoute("/__preview")({
  beforeLoad: () => {
    if (runtimeAppEnvironment() === "prod") {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router performs redirects by throwing a Redirect object.
      throw redirect({ href: "/" });
    }
  },
  component: () => <Outlet />,
});
