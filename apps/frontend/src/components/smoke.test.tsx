// @vitest-environment jsdom
/**
 * Batch smoke tests for simple presentational components.
 * Each test renders the component and verifies it produces
 * expected output without throwing.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";

// Stub react-router-dom for components that import it
vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    h("a", { href: to }, children),
  NavLink: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string | ((p: { isActive: boolean }) => string);
    end?: boolean;
  }) => {
    const cls = typeof className === "function" ? className({ isActive: false }) : className;
    return h("a", { href: to, className: cls }, children);
  },
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
}));

// Stub hooks used by TopNav
vi.mock("../hooks/useWebSocket", () => ({
  useWebSocket: () => ({ connect: vi.fn(), disconnect: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock("../hooks/useServiceInstances", () => ({
  useServiceInstances: () => ({ instances: [], instanceCount: 0, isMultiInstance: false }),
}));
vi.mock("../services/ApiClient", () => ({
  apiClient: { getAggregatedServices: vi.fn(async () => []) },
  sharedCore: { request: vi.fn(async () => ({})) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { DashboardGrid } from "./dashboard/DashboardGrid";
import { DashboardTileSection } from "./dashboard/DashboardTileSection";
import { TopNav } from "./dashboard/TopNav";
import { Delta } from "./primitives/Delta";
import { Skeleton } from "./primitives/Skeleton";
import { Sparkline } from "./primitives/Sparkline";
import { EventLog } from "./detail/EventLog";
import type { ServiceEvent } from "./detail/EventLog";
import { ConfirmDialog } from "./primitives/ConfirmDialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./primitives";
import { Toggle, ToggleGroup } from "./primitives/Toggle";
import { Popover, PopoverTrigger, PopoverContent } from "./primitives/Popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./primitives/Sheet";
import { KindCard } from "../pages/setup/KindCard";
import { Server } from "lucide-react";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  document.body.innerHTML = "";
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

// ─── DashboardGrid ────────────────────────────────────────────────────────────

describe("DashboardGrid", () => {
  it("renders children inside a grid wrapper", async () => {
    const { container, root } = await render(
      <DashboardGrid>
        <span id="child">hello</span>
      </DashboardGrid>
    );
    expect(container.querySelector("#child")).toBeTruthy();
    act(() => root.unmount());
  });

  it("applies optional className", async () => {
    const { container, root } = await render(
      <DashboardGrid className="custom-class">
        <span />
      </DashboardGrid>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("custom-class");
    act(() => root.unmount());
  });
});

// ─── DashboardTileSection ─────────────────────────────────────────────────────

describe("DashboardTileSection", () => {
  it("renders the section title", async () => {
    const { container, root } = await render(
      <DashboardTileSection
        title="Infrastructure"
        rows={[]}
        rowPrefix="infra"
      />
    );
    expect(container.textContent).toContain("Infrastructure");
    act(() => root.unmount());
  });

  it("renders tiles in rows", async () => {
    const tile1 = <span key="t1" id="tile1">tile1</span>;
    const tile2 = <span key="t2" id="tile2">tile2</span>;
    const { container, root } = await render(
      <DashboardTileSection
        title="Services"
        rows={[[tile1, tile2]]}
        rowPrefix="svc"
      />
    );
    expect(container.querySelector("#tile1")).toBeTruthy();
    expect(container.querySelector("#tile2")).toBeTruthy();
    act(() => root.unmount());
  });
});

// ─── Delta ────────────────────────────────────────────────────────────────────

describe("Delta", () => {
  it("renders positive delta with up arrow", async () => {
    const { container, root } = await render(<Delta value={5} unit="%" />);
    expect(container.textContent).toContain("↑");
    expect(container.textContent).toContain("+5");
    expect(container.textContent).toContain("%");
    act(() => root.unmount());
  });

  it("renders negative delta with down arrow", async () => {
    const { container, root } = await render(<Delta value={-3} />);
    expect(container.textContent).toContain("↓");
    act(() => root.unmount());
  });

  it("renders zero delta with neutral arrow", async () => {
    const { container, root } = await render(<Delta value={0} />);
    expect(container.textContent).toContain("→");
    act(() => root.unmount());
  });

  it("hides arrow when hideArrow=true", async () => {
    const { container, root } = await render(<Delta value={5} hideArrow />);
    expect(container.textContent).not.toContain("↑");
    act(() => root.unmount());
  });

  it("applies float precision", async () => {
    const { container, root } = await render(<Delta value={1.5} precision={2} />);
    expect(container.textContent).toContain("1.50");
    act(() => root.unmount());
  });

  it("renders size and tone variants without throwing", async () => {
    const { root: r1 } = await render(<Delta value={1} size="lg" tone="ok" />);
    const { root: r2 } = await render(<Delta value={-1} size="md" tone="crit" />);
    const { root: r3 } = await render(<Delta value={0} tone="neutral" />);
    act(() => r1.unmount());
    act(() => r2.unmount());
    act(() => r3.unmount());
  });

  it("inverts color semantics when invert=true", async () => {
    const { container, root } = await render(<Delta value={5} invert />);
    expect(container.querySelector("span")).toBeTruthy();
    act(() => root.unmount());
  });
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────

describe("Skeleton", () => {
  it("renders an aria-hidden div", async () => {
    const { container, root } = await render(<Skeleton />);
    const el = container.querySelector("[aria-hidden]");
    expect(el).toBeTruthy();
    act(() => root.unmount());
  });

  it("applies height style when provided", async () => {
    const { container, root } = await render(<Skeleton height={48} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("48px");
    act(() => root.unmount());
  });

  it("passes through className", async () => {
    const { container, root } = await render(<Skeleton className="w-full" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-full");
    act(() => root.unmount());
  });
});

// ─── EventLog ─────────────────────────────────────────────────────────────────

describe("EventLog", () => {
  const events: ServiceEvent[] = [
    { id: "1", ts: Date.now(), serviceKey: "bitcoin", level: "error", message: "node down" },
    { id: "2", ts: Date.now(), serviceKey: "tor", level: "warn", message: "latency high" },
    { id: "3", ts: Date.now(), serviceKey: "ipfs", level: "info", message: "peers connected" },
  ];

  it("renders empty label when events array is empty", async () => {
    const { container, root } = await render(<EventLog events={[]} emptyLabel="Nothing here" />);
    expect(container.textContent).toContain("Nothing here");
    act(() => root.unmount());
  });

  it("uses default empty label", async () => {
    const { container, root } = await render(<EventLog events={[]} />);
    expect(container.textContent).toContain("No recent events.");
    act(() => root.unmount());
  });

  it("renders all event messages", async () => {
    const { container, root } = await render(<EventLog events={events} />);
    expect(container.textContent).toContain("node down");
    expect(container.textContent).toContain("latency high");
    expect(container.textContent).toContain("peers connected");
    act(() => root.unmount());
  });

  it("renders level labels", async () => {
    const { container, root } = await render(<EventLog events={events} />);
    expect(container.textContent).toContain("error");
    expect(container.textContent).toContain("warn");
    expect(container.textContent).toContain("info");
    act(() => root.unmount());
  });
});

// ─── KindCard ─────────────────────────────────────────────────────────────────

describe("KindCard", () => {
  it("renders label and blurb", async () => {
    const { container, root } = await render(
      <KindCard
        kind="bitcoin"
        label="Bitcoin"
        icon={Server}
        blurb="Full node"
        onSelect={vi.fn()}
      />
    );
    expect(container.textContent).toContain("Bitcoin");
    expect(container.textContent).toContain("Full node");
    act(() => root.unmount());
  });

  it("calls onSelect with kind when clicked", async () => {
    const onSelect = vi.fn();
    const { container, root } = await render(
      <KindCard
        kind="bitcoin"
        label="Bitcoin"
        icon={Server}
        blurb="Full node"
        onSelect={onSelect}
      />
    );
    const btn = container.querySelector("button")!;
    await act(async () => { btn.click(); });
    expect(onSelect).toHaveBeenCalledWith("bitcoin");
    act(() => root.unmount());
  });

  it("has accessible aria-label", async () => {
    const { container, root } = await render(
      <KindCard
        kind="tor"
        label="Tor"
        icon={Server}
        blurb="Anonymity network"
        onSelect={vi.fn()}
      />
    );
    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("aria-label")).toBe("Add Tor");
    act(() => root.unmount());
  });
});

// ─── Sparkline ────────────────────────────────────────────────────────────────

describe("Sparkline", () => {
  it("renders an SVG element", async () => {
    const { container, root } = await render(
      <Sparkline data={[1, 2, 3, 4, 5]} />
    );
    expect(container.querySelector("svg")).toBeTruthy();
    act(() => root.unmount());
  });

  it("is aria-hidden when no label is provided", async () => {
    const { container, root } = await render(<Sparkline data={[1, 2, 3]} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    act(() => root.unmount());
  });

  it("has accessible role and label when label is provided", async () => {
    const { container, root } = await render(
      <Sparkline data={[1, 2, 3]} label="Block height trend" />
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Block height trend");
    act(() => root.unmount());
  });

  it("renders a path when data has values", async () => {
    const { container, root } = await render(<Sparkline data={[10, 20, 15]} />);
    expect(container.querySelector("path")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders nothing inside SVG when data is empty", async () => {
    const { container, root } = await render(<Sparkline data={[]} />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("path")).toBeNull();
    act(() => root.unmount());
  });

  it("renders nothing when all values are non-finite", async () => {
    const { container, root } = await render(
      <Sparkline data={[NaN, Infinity, -Infinity]} />
    );
    expect(container.querySelector("path")).toBeNull();
    act(() => root.unmount());
  });

  it("renders a baseline line when baseline is provided", async () => {
    const { container, root } = await render(
      <Sparkline data={[10, 20, 15]} baseline={12} />
    );
    expect(container.querySelector("line")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders fill path when fill=true (default)", async () => {
    const { container, root } = await render(<Sparkline data={[1, 2, 3]} fill />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
    act(() => root.unmount());
  });

  it("renders all tone variants without throwing", async () => {
    const tones = ["neutral", "ok", "warn", "crit", "accent"] as const;
    for (const tone of tones) {
      const { root } = await render(<Sparkline data={[1, 2, 3]} tone={tone} />);
      act(() => root.unmount());
    }
  });

  it("handles single-point data", async () => {
    const { container, root } = await render(<Sparkline data={[42]} />);
    expect(container.querySelector("path")).toBeTruthy();
    act(() => root.unmount());
  });

  it("handles flat data (all same value)", async () => {
    const { container, root } = await render(<Sparkline data={[5, 5, 5]} />);
    expect(container.querySelector("path")).toBeTruthy();
    act(() => root.unmount());
  });
});

// ─── Tooltip ──────────────────────────────────────────────────────────────────

describe("Tooltip", () => {
  it("renders trigger content without throwing", async () => {
    const { container, root } = await render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <button>hover me</button>
          </TooltipTrigger>
          <TooltipContent>Tip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(container.textContent).toContain("hover me");
    act(() => root.unmount());
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

describe("Tabs", () => {
  it("renders tab triggers and shows active content", async () => {
    const { container, root } = await render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    );
    expect(container.textContent).toContain("Tab A");
    expect(container.textContent).toContain("Tab B");
    expect(container.textContent).toContain("Content A");
    act(() => root.unmount());
  });
});

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

describe("ConfirmDialog", () => {
  it("does not render when open=false", async () => {
    const { container, root } = await render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Delete service?"
        onConfirm={vi.fn()}
      />
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
    act(() => root.unmount());
  });

  it("renders title and buttons when open=true", async () => {
    const { root } = await render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete service?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
      />
    );
    // Dialog content is rendered in a portal (document.body)
    expect(document.body.textContent).toContain("Delete service?");
    expect(document.body.textContent).toContain("This cannot be undone.");
    act(() => root.unmount());
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn(async () => {});
    await render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm"
        confirmLabel="Yes"
        onConfirm={onConfirm}
      />
    );
    const btn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Yes"
    )!;
    await act(async () => { btn.click(); });
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    await render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm"
        cancelLabel="No thanks"
        onConfirm={vi.fn()}
      />
    );
    const btn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "No thanks"
    )!;
    await act(async () => { btn.click(); });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ─── TopNav ───────────────────────────────────────────────────────────────────

describe("TopNav", () => {
  it("renders Watchman branding", async () => {
    const { container, root } = await render(<TopNav />);
    expect(container.textContent).toContain("Watchman");
    act(() => root.unmount());
  });

  it("renders nav links", async () => {
    const { container, root } = await render(<TopNav />);
    expect(container.textContent).toContain("Dashboard");
    expect(container.textContent).toContain("Services");
    act(() => root.unmount());
  });

  it("renders + Add service button when onAddService is provided", async () => {
    const onAddService = vi.fn();
    const { container, root } = await render(<TopNav onAddService={onAddService} />);
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    await act(async () => { btn!.click(); });
    expect(onAddService).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("renders without onAddService", async () => {
    const { container, root } = await render(<TopNav />);
    expect(container.querySelector("header")).toBeTruthy();
    act(() => root.unmount());
  });
});

// ─── Toggle ───────────────────────────────────────────────────────────────────

describe("Toggle", () => {
  it("renders a toggle button", async () => {
    const { container, root } = await render(<Toggle>Label</Toggle>);
    expect(container.textContent).toContain("Label");
    act(() => root.unmount());
  });

  it("renders with pressed state", async () => {
    const { container, root } = await render(<Toggle pressed={true}>On</Toggle>);
    expect(container.firstChild).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders as disabled", async () => {
    const { container, root } = await render(<Toggle disabled>Off</Toggle>);
    const el = container.querySelector("button");
    expect(el?.disabled).toBe(true);
    act(() => root.unmount());
  });
});

describe("ToggleGroup", () => {
  it("renders a group container with role=group", async () => {
    const { container, root } = await render(
      <ToggleGroup>
        <Toggle>A</Toggle>
        <Toggle>B</Toggle>
      </ToggleGroup>
    );
    expect(container.querySelector("[role='group']")).toBeTruthy();
    act(() => root.unmount());
  });

  it("renders children inside the group", async () => {
    const { container, root } = await render(
      <ToggleGroup>
        <Toggle>Alpha</Toggle>
        <Toggle>Beta</Toggle>
      </ToggleGroup>
    );
    expect(container.textContent).toContain("Alpha");
    expect(container.textContent).toContain("Beta");
    act(() => root.unmount());
  });
});

// ─── Popover ──────────────────────────────────────────────────────────────────

describe("Popover", () => {
  it("renders Popover trigger without crashing", async () => {
    const { container, root } = await render(
      <Popover>
        <PopoverTrigger asChild>
          <button>Open popover</button>
        </PopoverTrigger>
      </Popover>
    );
    expect(container.textContent).toContain("Open popover");
    act(() => root.unmount());
  });

  it("renders controlled open popover with content", async () => {
    const { container, root } = await render(
      <Popover open={true}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>
    );
    expect(container.textContent).toContain("Trigger");
    act(() => root.unmount());
  });
});

// ─── Sheet ────────────────────────────────────────────────────────────────────

describe("Sheet", () => {
  it("renders Sheet trigger without crashing", async () => {
    const { container, root } = await render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open sheet</button>
        </SheetTrigger>
      </Sheet>
    );
    expect(container.textContent).toContain("Open sheet");
    act(() => root.unmount());
  });

  it("renders SheetHeader, SheetBody, SheetFooter as divs", async () => {
    const { container, root } = await render(
      <div>
        <SheetHeader>Header content</SheetHeader>
        <SheetBody>Body content</SheetBody>
        <SheetFooter>Footer content</SheetFooter>
      </div>
    );
    expect(container.textContent).toContain("Header content");
    expect(container.textContent).toContain("Body content");
    expect(container.textContent).toContain("Footer content");
    act(() => root.unmount());
  });
});
