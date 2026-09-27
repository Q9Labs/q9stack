import { AddCircleIcon, Delete02Icon, Settings02Icon } from "@hugeicons/core-free-icons";

import { Badge, Button, Icon, Kbd, Spinner } from "../../../src/index";
import { definePreview, knob } from "../../../src/preview/index";
import { Row, Section, Stack } from "./_row";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const SIZES = ["sm", "md", "lg"] as const;

export const actionsPreview = definePreview({
  title: "Actions",
  scenarios: [
    {
      name: "Button",
      knobs: {
        variant: knob.select("variant", VARIANTS, "default"),
        size: knob.select("size", SIZES, "md"),
        loading: knob.boolean("loading", false),
        disabled: knob.boolean("disabled", false),
        label: knob.text("label", "Create project"),
      },
      render: ({ variant, size, loading, disabled, label }) => (
        <Stack>
          <Section title="Playground">
            <Row>
              <Button variant={variant} size={size} loading={loading} disabled={disabled}>
                <Icon icon={AddCircleIcon} size="sm" />
                {label}
              </Button>
              <Button variant={variant} size="icon" loading={loading} disabled={disabled}>
                <Icon icon={Settings02Icon} size="sm" label="Settings" />
              </Button>
            </Row>
          </Section>
          <Section title="Every variant">
            <Row>
              {VARIANTS.map((entry) => (
                <Button key={entry} variant={entry}>
                  {entry}
                </Button>
              ))}
            </Row>
          </Section>
          <Section title="Every size">
            <Row>
              {SIZES.map((entry) => (
                <Button key={entry} size={entry} variant="outline">
                  {entry}
                </Button>
              ))}
              <Button size="icon" variant="outline">
                <Icon icon={Delete02Icon} size="sm" label="Delete" />
              </Button>
            </Row>
          </Section>
        </Stack>
      ),
    },
    {
      name: "Badge",
      knobs: {},
      render: () => (
        <Row>
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="destructive">destructive</Badge>
        </Row>
      ),
    },
    {
      name: "Spinner & Kbd",
      knobs: {},
      render: () => (
        <Row>
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" label="Loading projects" />
          <span className="text-sm text-muted-foreground">
            Press <Kbd>⌘</Kbd> <Kbd>K</Kbd>
          </span>
        </Row>
      ),
    },
  ],
});
