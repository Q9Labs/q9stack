import { DevAccountSwitcher } from "@q9labsai/ui/auth";
import { definePreview } from "@q9labsai/ui/preview";

import { adminDevAccount, defaultDevAccount, devAccounts } from "../auth/mock-auth.js";

const onSwitch = (): void => {};
const onSignOut = (): void => {};

export default definePreview({
  title: "Shell navigation",
  scenarios: [
    {
      name: "member",
      knobs: {},
      render: () => (
        <DevAccountSwitcher
          defaultOpen
          accounts={devAccounts}
          current={defaultDevAccount.email}
          onSwitch={onSwitch}
          onSignOut={onSignOut}
        />
      ),
    },
    {
      name: "admin",
      knobs: {},
      render: () => (
        <DevAccountSwitcher
          defaultOpen
          accounts={devAccounts}
          current={adminDevAccount.email}
          onSwitch={onSwitch}
          onSignOut={onSignOut}
        />
      ),
    },
  ],
});
