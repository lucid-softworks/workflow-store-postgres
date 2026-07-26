import { verifyWorkflowCheckpointStore } from "@lucid-softworks/workflow-store-testkit";
import { describe, expect, it } from "vitest";

import {
  PostgresWorkflowCheckpointStore,
  type PostgresWorkflowDatabase,
  type PostgresWorkflowQueryResult,
} from "../src/index.js";

type Row = Readonly<Record<string, unknown>>;

class MemoryPostgresDatabase implements PostgresWorkflowDatabase {
  readonly calls: { text: string; values?: readonly unknown[] }[] = [];
  readonly rows = new Map<string, Row>();

  async query(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresWorkflowQueryResult> {
    this.calls.push({ text, ...(values === undefined ? {} : { values }) });
    if (text.includes("INSERT INTO")) {
      const entries = values as readonly [
        string,
        string,
        string,
        string,
        string,
        number,
      ];
      this.rows.set(entries[0], {
        completed_json: entries[3],
        completion_order_json: entries[4],
        execution_id: entries[0],
        fingerprint: entries[2],
        updated_at: String(entries[5]),
        workflow_id: entries[1],
      });
      return { rows: [] };
    }
    if (text.includes("SELECT")) {
      const row = this.rows.get(String(values?.[0]));
      return { rows: row === undefined ? [] : [row] };
    }
    if (text.includes("DELETE")) {
      const deleted = this.rows.delete(String(values?.[0]));
      return { rows: deleted ? [{}] : [] };
    }
    return { rows: [] };
  }
}

describe("PostgresWorkflowCheckpointStore", () => {
  it("satisfies the shared checkpoint store contract", async () => {
    await expect(
      verifyWorkflowCheckpointStore(() => ({
        store: new PostgresWorkflowCheckpointStore(
          new MemoryPostgresDatabase(),
        ),
      })),
    ).resolves.toBeUndefined();
  });

  it("migrates custom tables and accepts rowCount delete results", async () => {
    const database = new MemoryPostgresDatabase();
    expect(
      () =>
        new PostgresWorkflowCheckpointStore(database, {
          tableName: "bad-name",
        }),
    ).toThrow(TypeError);
    const store = new PostgresWorkflowCheckpointStore(database, {
      tableName: "custom_checkpoints",
    });
    await store.migrate();
    expect(database.calls[0]?.text).toContain(
      'CREATE TABLE IF NOT EXISTS "custom_checkpoints"',
    );
    const rowCountDatabase: PostgresWorkflowDatabase = {
      query: () => Promise.resolve({ rowCount: 1, rows: [] }),
    };
    expect(
      await new PostgresWorkflowCheckpointStore(rowCountDatabase).delete("run"),
    ).toBe(true);
  });
});
