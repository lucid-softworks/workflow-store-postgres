# `@lucid-softworks/workflow-store-postgres`

Durable asynchronous `WorkflowCheckpointStore` storage for PostgreSQL. It uses a
small structural query interface compatible with `pg` pools and clients, so the
package does not force a particular PostgreSQL driver version.

```ts
import { Pool } from "pg";
import { PostgresWorkflowCheckpointStore } from "@lucid-softworks/workflow-store-postgres";

const store = new PostgresWorkflowCheckpointStore(new Pool());
await store.migrate();
```

Saves use atomic `INSERT ... ON CONFLICT DO UPDATE` upserts keyed by execution
ID. Table names are validated before interpolation.
