import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "../../../src/index";
import { definePreview, knob } from "../../../src/preview/index";
import { Row, Stack } from "./_row";

const SIDES = ["start", "end", "top", "bottom"] as const;

export const overlaysPreview = definePreview({
  title: "Overlays",
  scenarios: [
    {
      name: "Dialog",
      knobs: { open: knob.boolean("open", true) },
      render: ({ open }) => (
        <Dialog defaultOpen={open}>
          <DialogTrigger render={<Button variant="outline">Delete workspace</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete workspace</DialogTitle>
              <DialogDescription>
                This removes every project and cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <DialogClose render={<Button variant="destructive">Delete</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
    {
      name: "Sheet",
      knobs: { side: knob.select("side", SIDES, "end"), open: knob.boolean("open", true) },
      render: ({ side, open }) => (
        <Sheet defaultOpen={open}>
          <SheetTrigger render={<Button variant="outline">Open sheet</Button>} />
          <SheetContent side={side}>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the list without leaving the page.</SheetDescription>
          </SheetContent>
        </Sheet>
      ),
    },
    {
      name: "Dropdown menu",
      knobs: { open: knob.boolean("open", true) },
      render: ({ open }) => (
        <DropdownMenu defaultOpen={open}>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon">
                <Icon icon={MoreHorizontalIcon} size="sm" label="Row actions" />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuCheckboxItem defaultChecked>Show archived</DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    {
      name: "Popover & tooltip",
      knobs: { open: knob.boolean("open", true) },
      render: ({ open }) => (
        <TooltipProvider>
          <Row>
            <Popover defaultOpen={open}>
              <PopoverTrigger render={<Button variant="outline">Invite teammate</Button>} />
              <PopoverContent className="w-72">
                <PopoverTitle>Invite teammate</PopoverTitle>
                <PopoverDescription>
                  They get read access until you promote them.
                </PopoverDescription>
              </PopoverContent>
            </Popover>
            <Tooltip defaultOpen={open}>
              <TooltipTrigger render={<Button variant="ghost">Hover me</Button>} />
              <TooltipContent>Shortcut: ⌘ K</TooltipContent>
            </Tooltip>
          </Row>
        </TooltipProvider>
      ),
    },
    {
      name: "Toast",
      knobs: { visible: knob.boolean("visible", true) },
      render: ({ visible }) => <ToastDemo visible={visible} />,
    },
  ],
});

function ToastDemo({ visible }: { readonly visible: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) {
      toast.dismiss();
      return;
    }
    toast.success("Project saved", { id: "preview-success", duration: Number.POSITIVE_INFINITY });
    toast.error("Could not reach the server", {
      id: "preview-error",
      duration: Number.POSITIVE_INFINITY,
    });
  }, [visible]);

  return (
    <Stack>
      <Row>
        <Button
          onClick={() => {
            setCount(count + 1);
            toast.success(`Project saved (${count + 1})`);
          }}
        >
          Show toast
        </Button>
        <Button variant="outline" onClick={() => toast.error("Could not reach the server")}>
          Show error toast
        </Button>
      </Row>
      <Toaster />
    </Stack>
  );
}
