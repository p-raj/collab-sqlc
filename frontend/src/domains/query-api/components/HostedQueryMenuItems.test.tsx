import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HostedQueryMoreMenuItems, HostedQuerySaveMenuItems } from "./HostedQueryMenuItems";

afterEach(cleanup);

describe("HostedQuerySaveMenuItems", () => {
  it("shows Host as API only for saved unhosted queries", () => {
    const onHostAsApi = vi.fn();

    render(
      <HostedQuerySaveMenuItems
        savedQueryId="query-1"
        isHosted={false}
        onHostAsApi={onHostAsApi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Host as API" }));
    expect(onHostAsApi).toHaveBeenCalledOnce();
  });

  it("stays hidden for unsaved queries", () => {
    render(<HostedQuerySaveMenuItems savedQueryId={null} isHosted={false} onHostAsApi={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Host as API" })).not.toBeInTheDocument();
  });
});

describe("HostedQueryMoreMenuItems", () => {
  it("shows Unhost API only for saved hosted queries", () => {
    const onUnhostApi = vi.fn();

    render(<HostedQueryMoreMenuItems savedQueryId="query-1" isHosted onUnhostApi={onUnhostApi} />);

    fireEvent.click(screen.getByRole("button", { name: "Unhost API" }));
    expect(onUnhostApi).toHaveBeenCalledOnce();
  });

  it("stays hidden for unhosted queries", () => {
    render(
      <HostedQueryMoreMenuItems savedQueryId="query-1" isHosted={false} onUnhostApi={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Unhost API" })).not.toBeInTheDocument();
  });
});
