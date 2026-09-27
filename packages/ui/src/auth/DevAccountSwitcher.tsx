"use client";

import { Logout01Icon, UserSwitchIcon } from "@hugeicons/core-free-icons";

import { cn } from "../cn";
import { Icon } from "../icon";
import { Button } from "../primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/popover";
import { Separator } from "../primitives/separator";
import { DEV_ACCOUNT_SWITCHER_LABELS, type DevAccountSwitcherLabels } from "./labels";

export interface DevAccount {
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export interface DevAccountSwitcherProps {
  readonly accounts: readonly DevAccount[];
  readonly current?: string | undefined;
  readonly onSwitch: (email: string) => void;
  readonly onSignOut: () => void;
  readonly labels?: Partial<DevAccountSwitcherLabels> | undefined;
  /** Starts expanded; useful in previews and tests. */
  readonly defaultOpen?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Development-only affordance: a floating pill at the bottom inline-start that
 * expands into the seeded accounts. Never render it in production builds.
 */
export function DevAccountSwitcher({
  accounts,
  current,
  onSwitch,
  onSignOut,
  labels,
  defaultOpen = false,
  className,
}: DevAccountSwitcherProps) {
  const text = { ...DEV_ACCOUNT_SWITCHER_LABELS, ...labels };
  const active = accounts.find((account) => account.email === current);

  return (
    <div data-slot="dev-account-switcher" className={cn("fixed bottom-4 start-4 z-50", className)}>
      <Popover defaultOpen={defaultOpen}>
        <PopoverTrigger
          aria-label={text.open}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-popover ps-3 pe-4 text-xs font-medium text-popover-foreground shadow-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon icon={UserSwitchIcon} size="sm" />
          <span className="truncate">{active === undefined ? text.title : active.name}</span>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-64 p-1">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{text.title}</p>
          <ul className="flex flex-col">
            {accounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => onSwitch(account.email)}
                  aria-current={account.email === current ? "true" : undefined}
                  className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-current:bg-accent aria-current:text-accent-foreground"
                >
                  <span className="font-medium">{account.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {account.email} · {account.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Separator className="my-1" />
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
            <Icon icon={Logout01Icon} size="sm" flipInRtl />
            {text.signOut}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
