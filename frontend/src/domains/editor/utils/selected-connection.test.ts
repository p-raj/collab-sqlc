import { describe, expect, it } from "vitest";
import {
    getSelectedConnectionDbType,
    getSelectedConnectionId,
    resolveConnectionOverride,
    shouldSyncActiveConnection,
} from "./selected-connection";

describe("selected connection helpers", () => {
    it("prefers the active tab connection over the global active connection", () => {
        expect(getSelectedConnectionId("tab-conn", "global-conn")).toBe("tab-conn");
    });

    it("falls back to the global active connection when the tab has none", () => {
        expect(getSelectedConnectionId(null, "global-conn")).toBe("global-conn");
    });

    it("resolves the selected connection db type from the tab connection first", () => {
        expect(
            getSelectedConnectionDbType("tab-conn", "global-conn", [
                { id: "global-conn", db_type: "postgresql" },
                { id: "tab-conn", db_type: "clickhouse" },
            ]),
        ).toBe("clickhouse");
    });

    it("falls back to the global connection db type when the tab has no connection", () => {
        expect(
            getSelectedConnectionDbType(null, "global-conn", [
                { id: "global-conn", db_type: "postgresql" },
            ]),
        ).toBe("postgresql");
    });

    it("syncs the global connection when the selected tab connection exists and differs", () => {
        expect(
            shouldSyncActiveConnection("tab-conn", "global-conn", ["tab-conn", "other-conn"]),
        ).toBe(true);
    });

    it("does not sync when the selected connection is missing from the available list", () => {
        expect(
            shouldSyncActiveConnection("missing-conn", "global-conn", ["other-conn"]),
        ).toBe(false);
    });

    it("does not sync when the selected connection already matches the global state", () => {
        expect(
            shouldSyncActiveConnection("shared-conn", "shared-conn", ["shared-conn"]),
        ).toBe(false);
    });

    it("lets sidebar actions use an explicit connection override", () => {
        expect(resolveConnectionOverride("sidebar-conn", "global-conn")).toBe("sidebar-conn");
    });

    it("falls back to the shared editor connection when no override is provided", () => {
        expect(resolveConnectionOverride(undefined, "global-conn")).toBe("global-conn");
    });
});