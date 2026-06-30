import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const OFFLINE_OPERATION_STATUS = {
  PENDING: "PENDING",
  SYNCED: "SYNCED",
  FAILED: "FAILED"
};

let databasePromise = null;

async function getCurrentOwnerId() {
  const userJson = await AsyncStorage.getItem("mes_lite_mobile_user");

  if (!userJson) {
    return null;
  }

  try {
    return JSON.parse(userJson)?.id ?? null;
  } catch (_error) {
    return null;
  }
}

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
      ownerId TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retryCount INTEGER NOT NULL DEFAULT 0,
      errorMessage TEXT,
      createdAt TEXT NOT NULL,
      syncedAt TEXT
    );
  `);

  const columns = await database.getAllAsync("PRAGMA table_info(offline_queue);");
  if (!columns.some((column) => column.name === "ownerId")) {
    await database.execAsync("ALTER TABLE offline_queue ADD COLUMN ownerId TEXT;");
  }

  const ownerId = await getCurrentOwnerId();
  if (ownerId) {
    await database.runAsync("UPDATE offline_queue SET ownerId = ? WHERE ownerId IS NULL;", [ownerId]);
  }

  await database.execAsync("CREATE INDEX IF NOT EXISTS idx_offline_queue_status_created ON offline_queue(status, createdAt);");
  await database.execAsync("CREATE INDEX IF NOT EXISTS idx_offline_queue_owner_status_created ON offline_queue(ownerId, status, createdAt);");
}

export async function enqueueOfflineOperation({ operationId, type, payload }) {
  await initOfflineQueue();
  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const ownerId = await getCurrentOwnerId();

  if (!ownerId) {
    throw new Error("Offline işlem için aktif kullanıcı bulunamadı.");
  }

  await database.runAsync(
    `INSERT OR IGNORE INTO offline_queue (operationId, ownerId, type, payload, status, retryCount, errorMessage, createdAt, syncedAt)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?, NULL);`,
    [operationId, ownerId, type, JSON.stringify(payload), OFFLINE_OPERATION_STATUS.PENDING, createdAt]
  );

  const row = await database.getFirstAsync("SELECT * FROM offline_queue WHERE operationId = ? AND ownerId = ?;", [operationId, ownerId]);
  return parseQueueRow(row);
}

export async function getPendingOfflineOperations(limit = 25) {
  await initOfflineQueue();
  const database = await getDatabase();
  const ownerId = await getCurrentOwnerId();
  if (!ownerId) {
    return [];
  }
  const rows = await database.getAllAsync(
    "SELECT * FROM offline_queue WHERE ownerId = ? AND status = ? ORDER BY createdAt ASC LIMIT ?;",
    [ownerId, OFFLINE_OPERATION_STATUS.PENDING, limit]
  );

  return rows.map(parseQueueRow);
}

export async function getOfflineOperations({ status, limit = 30 } = {}) {
  await initOfflineQueue();
  const database = await getDatabase();
  const ownerId = await getCurrentOwnerId();
  if (!ownerId) {
    return [];
  }
  const rows = status
    ? await database.getAllAsync(
        "SELECT * FROM offline_queue WHERE ownerId = ? AND status = ? ORDER BY createdAt DESC LIMIT ?;",
        [ownerId, status, limit]
      )
    : await database.getAllAsync("SELECT * FROM offline_queue WHERE ownerId = ? ORDER BY createdAt DESC LIMIT ?;", [ownerId, limit]);

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

export async function retryOfflineOperation(id) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE offline_queue SET status = ?, retryCount = 0, errorMessage = NULL, syncedAt = NULL WHERE id = ? AND status = ?;",
    [OFFLINE_OPERATION_STATUS.PENDING, id, OFFLINE_OPERATION_STATUS.FAILED]
  );
}

export async function deleteFailedOfflineOperation(id) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM offline_queue WHERE id = ? AND status = ?;", [id, OFFLINE_OPERATION_STATUS.FAILED]);
}

export async function deleteAllFailedOfflineOperations() {
  await initOfflineQueue();
  const database = await getDatabase();
  const ownerId = await getCurrentOwnerId();

  if (!ownerId) {
    return;
  }

  await database.runAsync("DELETE FROM offline_queue WHERE ownerId = ? AND status = ?;", [ownerId, OFFLINE_OPERATION_STATUS.FAILED]);
}

export async function getOfflineQueueSummary() {
  await initOfflineQueue();
  const database = await getDatabase();
  const ownerId = await getCurrentOwnerId();
  const rows = ownerId
    ? await database.getAllAsync("SELECT status, COUNT(*) as count FROM offline_queue WHERE ownerId = ? GROUP BY status;", [ownerId])
    : [];
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
