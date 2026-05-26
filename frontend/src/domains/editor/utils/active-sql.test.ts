import { describe, expect, it } from "vitest";
import { extractActiveSql } from "./active-sql";

describe("extractActiveSql", () => {
    const multiStatementQuery = `SELECT
    *
FROM contacts_memberbook AS CM
INNER JOIN auth_user AS AU
    ON (
        AU.id = CM.contact_id
    )
ORDER BY
    AU.id DESC
LIMIT 10
;

WITH activity_log AS (
    SELECT
        *
    FROM vms_activitylog AS VA
    INNER JOIN vms_visitor AS VV
        ON (
            VV.activity_log_id = VA.id
        )
    ORDER BY
        VV.id DESC
    LIMIT 1
)
SELECT
    *
FROM activity_log
;`;

    it("returns the selection when text is selected", () => {
        const sql = "select 1;\nselect 2;";
        expect(
            extractActiveSql(sql, sql.length, {
                startOffset: sql.indexOf("select 2"),
                endOffset: sql.length - 1,
            }),
        ).toBe("select 2");
    });

    it("returns the full query when no semicolon exists", () => {
        expect(extractActiveSql("  select * from users  ", 10)).toBe("select * from users");
    });

    it("returns the statement containing the cursor", () => {
        const sql = "select 1;\n\nselect 2;\nselect 3;";
        const cursor = sql.indexOf("2");
        expect(extractActiveSql(sql, cursor)).toBe("select 2;");
    });

    it("uses the next statement when the cursor is in whitespace before it", () => {
        const sql = "select 1;\n\nselect 2;";
        const cursor = sql.indexOf("\n\n") + 1;
        expect(extractActiveSql(sql, cursor)).toBe("select 2;");
    });

    it("uses the previous statement when the cursor is after the final semicolon", () => {
        const sql = "select 1;\nselect 2;\n   ";
        expect(extractActiveSql(sql, sql.length)).toBe("select 2;");
    });

    it("returns the first statement for a cursor inside the first block", () => {
        const cursor = multiStatementQuery.indexOf("contacts_memberbook");

        expect(extractActiveSql(multiStatementQuery, cursor)).toBe(`SELECT
    *
FROM contacts_memberbook AS CM
INNER JOIN auth_user AS AU
    ON (
        AU.id = CM.contact_id
    )
ORDER BY
    AU.id DESC
LIMIT 10
;`);
    });

    it("returns the second statement for a cursor inside the second block", () => {
        const cursor = multiStatementQuery.indexOf("vms_activitylog");

        expect(extractActiveSql(multiStatementQuery, cursor)).toBe(`WITH activity_log AS (
    SELECT
        *
    FROM vms_activitylog AS VA
    INNER JOIN vms_visitor AS VV
        ON (
            VV.activity_log_id = VA.id
        )
    ORDER BY
        VV.id DESC
    LIMIT 1
)
SELECT
    *
FROM activity_log
;`);
    });
});