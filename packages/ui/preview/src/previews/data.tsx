import { Folder01Icon } from "@hugeicons/core-free-icons";

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  ScrollArea,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "../../../src/index";
import { definePreview, knob } from "../../../src/preview/index";
import { Row, Section, Stack } from "./_row";

const ROWS = [
  { name: "Atlas migration", owner: "Dana Ito", status: "In review", spend: "$12,400" },
  { name: "Billing revamp", owner: "Omar Haddad", status: "Shipped", spend: "$8,050" },
  { name: "Partner onboarding", owner: "Lin Zhao", status: "Blocked", spend: "$1,900" },
];

export const dataPreview = definePreview({
  title: "Data display",
  scenarios: [
    {
      name: "Card",
      knobs: { footer: knob.boolean("footer", true) },
      render: ({ footer }) => (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Monthly spend</CardTitle>
            <CardDescription>Across every connected workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-medium tabular-nums">$22,350</p>
            <p className="text-sm text-muted-foreground">Up 8% on last month.</p>
          </CardContent>
          {footer ? (
            <CardFooter>
              <Button variant="outline" size="sm">
                View breakdown
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      ),
    },
    {
      name: "Table",
      knobs: {},
      render: () => (
        <Table>
          <TableCaption>Projects updated in the last 30 days.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Spend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{row.owner}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell className="text-end tabular-nums">{row.spend}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ),
    },
    {
      name: "Tabs",
      knobs: {},
      render: () => (
        <Tabs defaultValue="overview" className="max-w-lg">
          <TabsList>
            <TabsTab value="overview">Overview</TabsTab>
            <TabsTab value="activity">Activity</TabsTab>
            <TabsTab value="settings">Settings</TabsTab>
          </TabsList>
          <TabsPanel value="overview">Three projects need review this week.</TabsPanel>
          <TabsPanel value="activity">Dana Ito closed two tickets.</TabsPanel>
          <TabsPanel value="settings">Only owners can change billing.</TabsPanel>
        </Tabs>
      ),
    },
    {
      name: "Avatar, separator, scroll area",
      knobs: {},
      render: () => (
        <Stack>
          <Section title="Avatar">
            <Row>
              <Avatar size="sm">
                <AvatarFallback>DI</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>OH</AvatarFallback>
              </Avatar>
              <Avatar size="lg">
                <AvatarFallback>LZ</AvatarFallback>
              </Avatar>
            </Row>
          </Section>
          <Separator />
          <Section title="Scroll area">
            <ScrollArea className="h-40 max-w-sm rounded-md border border-border p-3">
              <ul className="flex flex-col gap-2 text-sm">
                {Array.from({ length: 20 }, (_, index) => (
                  <li key={index}>Activity entry {index + 1}</li>
                ))}
              </ul>
            </ScrollArea>
          </Section>
        </Stack>
      ),
    },
    {
      name: "Empty & loading",
      knobs: {},
      render: () => (
        <Stack>
          <EmptyState
            icon={Folder01Icon}
            title="No projects yet"
            description="Create your first project to see spend and activity here."
            action={<Button size="sm">New project</Button>}
          />
          <Section title="Skeleton">
            <div className="flex max-w-sm flex-col gap-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Section>
        </Stack>
      ),
    },
  ],
});
