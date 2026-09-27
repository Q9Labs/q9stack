import { PreviewGallery, type definePreview } from "@q9labsai/ui/preview";
import { createFileRoute } from "@tanstack/react-router";

type PreviewDefinition = ReturnType<typeof definePreview>;

interface PreviewModule {
  readonly default: PreviewDefinition;
}

const previewModules = import.meta.glob<PreviewModule>("../../**/*.preview.tsx", {
  eager: true,
});

const previews = Object.values(previewModules).map((module) => module.default);

// Kept out of the JSX so line width stays stable for any generated app name.
const previewTitle = "__APP_NAME__ preview";

export const Route = createFileRoute("/__preview/")({ component: PreviewPage });

function PreviewPage() {
  return (
    <div className="mx-auto grid w-full max-w-[100rem] gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{previewTitle}</h1>
      <PreviewGallery
        previews={previews}
        tweaker={{ locales: ["en", "ar"], roles: ["admin", "member", "viewer"] }}
      />
    </div>
  );
}
