import {
  type WorkflowCheckpoint,
  type WorkflowCheckpointStore,
} from "@lucid-softworks/workflow-checkpoint";
import {
  workflowCheckpointFromRecord,
  workflowCheckpointToRecord,
  type WorkflowCheckpointRecord,
} from "@lucid-softworks/workflow-checkpoint-codec";

export type PostgresWorkflowQueryResult = Readonly<{
  rows: readonly Readonly<Record<string, unknown>>[];
  rowCount?: number | null;
}>;

export interface PostgresWorkflowDatabase {
  query(
    text: string,
    values?: readonly unknown[],
  ): PromiseLike<PostgresWorkflowQueryResult>;
}

function validateTableName(tableName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName))
    throw new TypeError("PostgreSQL workflow checkpoint table name is invalid");
  return tableName;
}

function rowToRecord(
  row: Readonly<Record<string, unknown>>,
): WorkflowCheckpointRecord {
  return {
    completedJson: String(row.completed_json),
    completionOrderJson: String(row.completion_order_json),
    executionId: String(row.execution_id),
    fingerprint: String(row.fingerprint),
    updatedAt: Number(row.updated_at),
    workflowId: String(row.workflow_id),
  };
}

/** Durable checkpoint storage for pg-compatible pools and clients. */
export class PostgresWorkflowCheckpointStore implements WorkflowCheckpointStore {
  readonly #table: string;

  constructor(
    readonly database: PostgresWorkflowDatabase,
    options: Readonly<{ tableName?: string }> = {},
  ) {
    this.#table = validateTableName(
      options.tableName ?? "workflow_checkpoints",
    );
  }

  async migrate(): Promise<void> {
    await this.database.query(`
      CREATE TABLE IF NOT EXISTS "${this.#table}" (
        execution_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        completed_json TEXT NOT NULL,
        completion_order_json TEXT NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "${this.#table}_workflow"
        ON "${this.#table}" (workflow_id, updated_at);
    `);
  }

  async load(executionId: string): Promise<WorkflowCheckpoint | undefined> {
    const result = await this.database.query(
      `SELECT execution_id, workflow_id, fingerprint, completed_json,
              completion_order_json, updated_at
       FROM "${this.#table}" WHERE execution_id = $1`,
      [executionId],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : workflowCheckpointFromRecord(rowToRecord(row));
  }

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    const record = workflowCheckpointToRecord(checkpoint);
    await this.database.query(
      `INSERT INTO "${this.#table}" (
         execution_id, workflow_id, fingerprint, completed_json,
         completion_order_json, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (execution_id) DO UPDATE SET
         workflow_id = EXCLUDED.workflow_id,
         fingerprint = EXCLUDED.fingerprint,
         completed_json = EXCLUDED.completed_json,
         completion_order_json = EXCLUDED.completion_order_json,
         updated_at = EXCLUDED.updated_at`,
      [
        record.executionId,
        record.workflowId,
        record.fingerprint,
        record.completedJson,
        record.completionOrderJson,
        record.updatedAt,
      ],
    );
  }

  async delete(executionId: string): Promise<boolean> {
    const result = await this.database.query(
      `DELETE FROM "${this.#table}" WHERE execution_id = $1`,
      [executionId],
    );
    return (result.rowCount ?? result.rows.length) === 1;
  }
}
