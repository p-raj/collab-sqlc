import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HostedApiEndpointChip } from "./HostedApiEndpointChip";
import { buildHostedApiUrl } from "../utils/hosted-api-url";

const toastSuccess = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText,
  },
});

afterEach(() => {
  cleanup();
  toastSuccess.mockReset();
  writeText.mockClear();
});

describe("HostedApiEndpointChip", () => {
  it("stays hidden until the saved query is hosted", () => {
    render(<HostedApiEndpointChip connectionId="conn-1" queryId="query-1" isHosted={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("copies the full hosted endpoint URL", async () => {
    render(<HostedApiEndpointChip connectionId="conn-1" queryId="query-1" isHosted />);

    fireEvent.click(screen.getByRole("button", { name: /\/api\/v1\/q\/conn-1/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(buildHostedApiUrl("conn-1", "query-1"));
      expect(toastSuccess).toHaveBeenCalledWith("Full API URL copied");
    });
  });
});
