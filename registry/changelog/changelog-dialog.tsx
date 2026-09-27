import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  changelogEntryTypes,
  type Changelog,
  type ChangelogEntryType,
  type ChangelogRelease,
} from "@/lib/changelog";

export type ChangelogLabels = {
  title: string;
  description: string;
  empty: string;
  version: (version: string) => string;
  types: Record<ChangelogEntryType, string>;
};

const defaultChangelogLabels: ChangelogLabels = {
  title: "Changelog",
  description: "Changes in recent releases, newest first.",
  empty: "No release notes yet. New features and fixes will appear here after the next release.",
  version: (version) => `Version ${version}`,
  types: {
    added: "New",
    changed: "Changed",
    fixed: "Fixed",
    removed: "Removed",
    security: "Security",
  },
};

type ChangelogDialogProps = {
  data: Changelog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Translated copy. Defaults to English. */
  labels?: ChangelogLabels;
  /** BCP 47 locale for dates. Defaults to the `lang` attribute of the document. */
  locale?: string;
};

function formatReleaseDate(date: string, locale: string | undefined) {
  // Release dates are calendar days, so format them in UTC to avoid shifting by a day.
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function documentLocale() {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.lang || undefined;
}

function ReleaseNotes({
  release,
  labels,
  locale,
}: {
  release: ChangelogRelease;
  labels: ChangelogLabels;
  locale: string | undefined;
}) {
  const groups = changelogEntryTypes
    .map((type) => ({ type, entries: release.entries.filter((entry) => entry.type === type) }))
    .filter((group) => group.entries.length > 0);

  return (
    <article className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-medium">{labels.version(release.version)}</h3>
        <time dateTime={release.date} className="text-muted-foreground">
          {formatReleaseDate(release.date, locale)}
        </time>
      </header>
      {groups.map((group) => (
        <section key={group.type} className="flex flex-col gap-2">
          <h4 className="text-muted-foreground">{labels.types[group.type]}</h4>
          <ul className="flex flex-col gap-2">
            {group.entries.map((entry) => (
              <li key={entry.title}>
                <p className="font-medium">{entry.title}</p>
                {entry.body !== "" && <p className="text-muted-foreground">{entry.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

export function ChangelogDialog({
  data,
  open,
  onOpenChange,
  labels = defaultChangelogLabels,
  locale = documentLocale(),
}: ChangelogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        {data.releases.length === 0 ? (
          <p className="rounded-md bg-muted p-4 text-muted-foreground">{labels.empty}</p>
        ) : (
          <ol className="-me-4 flex max-h-96 flex-col divide-y overflow-y-auto pe-4">
            {data.releases.map((release) => (
              <li key={release.version} className="py-4 first:pt-0 last:pb-0">
                <ReleaseNotes release={release} labels={labels} locale={locale} />
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
