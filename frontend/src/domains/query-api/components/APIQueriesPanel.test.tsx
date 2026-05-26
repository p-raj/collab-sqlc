import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { APIQueriesPanel } from "./APIQueriesPanel";

const loadAllMock = vi.fn();

const savedQueriesState = {
  folders: [] as Array<{ id: string; name: string; parent_id: string | null; is_shared: boolean }>,
  queries: [] as Array<{
    id: string;
    title: string;
    description: string | null;
    folder_id: string | null;
    api_enabled: boolean;
    is_shared: boolean;
  }>,
  isLoading: false,
  loadAll: loadAllMock,
};

vi.mock("@/domains/queries/hooks/use-saved-queries-store", () => ({
  useSavedQueriesStore: () => savedQueriesState,
}));

afterEach(() => {
  cleanup();
  loadAllMock.mockReset();
  savedQueriesState.folders = [];
  savedQueriesState.queries = [];
  savedQueriesState.isLoading = false;
});

describe("APIQueriesPanel", () => {
  it("keeps the header visible when there are no hosted queries", async () => {
    render(<APIQueriesPanel onOpenQuery={vi.fn()} />);

    expect(loadAllMock).toHaveBeenCalledTimes(1);
    screen.getByText("Hosted Queries");
    screen.getByText("No hosted queries yet");
  });

  it("shows only hosted queries and opens them on click", async () => {
    const hostedQuery = {
      id: "query-1",
      title: "Members API",
      description: "Hosted members endpoint",
      folder_id: null,
      api_enabled: true,
      is_shared: true,
    };
    savedQueriesState.queries = [
      hostedQuery,
      {
        id: "query-2",
        title: "Draft query",
        description: null,
        folder_id: null,
        api_enabled: false,
        is_shared: false,
      },
    ];
    const onOpenQuery = vi.fn();

    render(<APIQueriesPanel onOpenQuery={onOpenQuery} />);

    fireEvent.click(screen.getByRole("button", { name: /members api/i }));

    expect(screen.queryByText("Draft query")).toBeNull();
    expect(onOpenQuery).toHaveBeenCalledWith(hostedQuery);
  });
});
