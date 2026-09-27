import { Badge, Card } from "@q9labsai/ui";
import { definePreview, knob } from "@q9labsai/ui/preview";

const homeKnobs = {
  state: knob.select("state", ["loading", "empty", "populated", "error"], "populated"),
  showStatus: knob.boolean("show status", true),
  label: knob.text("label", "Template ready"),
  density: knob.number("density", 3, { min: 1, max: 6, step: 1 }),
};

export default definePreview({
  title: "Home page",
  scenarios: [
    {
      name: "loading",
      knobs: {},
      render: () => <Card className="grid min-h-40 place-items-center p-6">Loading…</Card>,
    },
    {
      name: "empty",
      knobs: {},
      render: () => <Card className="grid min-h-40 place-items-center p-6">Nothing here yet.</Card>,
    },
    {
      name: "populated",
      knobs: homeKnobs,
      render: (knobs) => (
        <Card className="grid gap-4 p-6" data-density={knobs.density}>
          <Badge>{knobs.label}</Badge>
          {knobs.state === "populated" && knobs.showStatus ? (
            <output>Healthy foundation</output>
          ) : null}
        </Card>
      ),
    },
    {
      name: "error",
      knobs: {},
      render: () => (
        <Card className="grid min-h-40 place-items-center p-6">Something needs attention.</Card>
      ),
    },
  ],
});
