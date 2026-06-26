import * as SQLite from "expo-sqlite";

export const OFFLINE_OPERATION_STATUS = {
  PENDING: "PENDING",
  SYNCED: "SYNCED",
  FAILED: "FAILED"
};

let databasePromise = null;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("mes_lite_offline.db");
  }

  return databasePromise;
}

function parseQueueRow(row) {
  return {
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : null
  };
}

export async function initOfflineQueue() {
  const database = await getDatabase();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operationId TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retryCount INTEGER NOT NULL DEFAULT 0,
      errorMessage TEXT,
      createdAt TEXT NOT NULL,
      syncedAt TEXT
    );
  `);

  await database.execAsync("CREATE INDEX IF NOT EXISTS idx_offline_queue_status_created ON offline_queue(status, createdAt);");
}

export async function enqueueOfflineOperation({ operationId, type, payload }) {
  await initOfflineQueue();
  const database = await getDatabase();
  const createdAt = new Date().toISOString();

  await database.runAsync(
    `INSERT OR IGNORE INTO offline_queue (operationId, type, payload, status, retryCount, errorMessage, createdAt, syncedAt)
     VALUES (?, ?, ?, ?, 0, NULL, ?, NULL);`,
    [operationId, type, JSON.stringify(payload), OFFLINE_OPERATION_STATUS.PENDING, createdAt]
  );

  const row = await database.getFirstAsync("SELECT * FROM offline_queue WHERE operationId = ?;", [operationId]);
  return parseQueueRow(row);
}

export async function getPendingOfflineOperations(limit = 25) {
  await initOfflineQueue();
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    "SELECT * FROM offline_queue WHERE status = ? ORDER BY createdAt ASC LIMIT ?;",
    [OFFLINE_OPERATION_STATUS.PENDING, limit]
  );

  return rows.map(parseQueueRow);
}

export async function markOfflineOperationSynced(id) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE offline_queue SET status = ?, syncedAt = ?, errorMessage = NULL WHERE id = ?;",
    [OFFLINE_OPERATION_STATUS.SYNCED, new Date().toISOString(), id]
  );
}

export async function markOfflineOperationRetry(id, retryCount, errorMessage) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE offline_queue SET retryCount = ?, errorMessage = ? WHERE id = ?;",
    [retryCount, errorMessage, id]
  );
}

export async function markOfflineOperationFailed(id, retryCount, errorMessage) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE offline_queue SET status = ?, retryCount = ?, errorMessage = ? WHERE id = ?;",
    [OFFLINE_OPERATION_STATUS.FAILED, retryCount, errorMessage, id]
  );
}

export async function getOfflineQueueSummary() {
  await initOfflineQueue();
  const database = await getDatabase();
  const rows = await database.getAllAsync("SELECT status, COUNT(*) as count FROM offline_queue GROUP BY status;");
  const summary = {
    pending: 0,
    synced: 0,
    failed: 0
  };

  rows.forEach((row) => {
    if (row.status === OFFLINE_OPERATION_STATUS.PENDING) {
      summary.pending = row.count;
    }

    if (row.status === OFFLINE_OPERATION_STATUS.SYNCED) {
      summary.synced = row.count;
    }

    if (row.status === OFFLINE_OPERATION_STATUS.FAILED) {
      summary.failed = row.count;
    }
  });

  return summary;
}
