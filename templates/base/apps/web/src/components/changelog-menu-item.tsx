import { Megaphone01Icon } from "@hugeicons/core-free-icons";
import { useLingui } from "@lingui/react/macro";
import {
  Button,
  cn,
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebarCollapsed,
} from "@q9labsai/ui";
import { useState } from "react";

import changelogJson from "../generated/changelog.json";
import { useChangelog } from "../hooks/use-changelog.js";
import { useLocale } from "../i18n/locale-provider.js";
import { parseChangelog } from "../lib/changelog.js";
import { ChangelogDialog, type ChangelogLabels } from "./changelog-dialog.js";

const changelog = parseChangelog(changelogJson);

export function ChangelogMenuItem() {
  const { t } = useLingui();
  const { locale } = useLocale();
  const collapsed = useSidebarCollapsed();
  const [open, setOpen] = useState(false);
  const { hasUnseen, markSeen } = useChangelog(changelog);
  const buttonLabel = t({ id: "changelog.button", message: "View release notes" });
  const newUpdatesLabel = t({ id: "changelog.unseen", message: "New updates" });
  const labels: ChangelogLabels = {
    title: t({ id: "changelog.title", message: "Changelog" }),
    description: t({
      id: "changelog.description",
      message: "Changes in recent releases, newest first.",
    }),
    empty: t({
      id: "changelog.empty",
      message:
        "No release notes yet. New features and fixes will appear here after the next release.",
    }),
    version: (version) => t({ id: "changelog.version", message: `Version ${version}` }),
    types: {
      added: t({ id: "changelog.type.added", message: "New" }),
      changed: t({ id: "changelog.type.changed", message: "Changed" }),
      fixed: t({ id: "changelog.type.fixed", message: "Fixed" }),
      removed: t({ id: "changelog.type.removed", message: "Removed" }),
      security: t({ id: "changelog.type.security", message: "Security" }),
    },
  };

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) markSeen();
  }

  const button = (
    <Button
      type="button"
      variant="ghost"
      size={collapsed ? "icon" : "md"}
      aria-label={hasUnseen ? `${buttonLabel}: ${newUpdatesLabel}` : buttonLabel}
      title={buttonLabel}
      className={cn(
        "relative h-auto w-full justify-start rounded-md px-2.5 py-2 text-sidebar-foreground/75",
        collapsed && "justify-center px-0",
      )}
      onClick={() => onOpenChange(true)}
    >
      <Icon icon={Megaphone01Icon} size="sm" />
      <span className={collapsed ? "sr-only" : undefined}>{buttonLabel}</span>
      {hasUnseen ? (
        <span
          aria-hidden="true"
          className={cn(
            "ms-auto size-2 rounded-full bg-primary",
            collapsed && "absolute top-2 end-2",
          )}
        />
      ) : null}
    </Button>
  );

  return (
    <>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent side={locale === "ar" ? "left" : "right"}>{buttonLabel}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <ChangelogDialog
        data={changelog}
        open={open}
        onOpenChange={onOpenChange}
        labels={labels}
        locale={locale}
      />
    </>
  );
}
