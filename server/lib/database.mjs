import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

let databaseWriteQueue = Promise.resolve();

export async function loadDatabase(SQL, databasePath) {
  await mkdir(dirname(databasePath), { recursive: true });
  if (existsSync(databasePath)) {
    const data = readFileSync(databasePath);
    return new SQL.Database(data);
  }
  return new SQL.Database();
}

export function selectAll(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

export function selectOne(db, sql, params = []) {
  const rows = selectAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function persistDatabase(db, databasePath) {
  const snapshot = Buffer.from(db.export());
  databaseWriteQueue = databaseWriteQueue.then(async () => {
    await mkdir(dirname(databasePath), { recursive: true });
    const tempPath = `${databasePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, snapshot);
    await rename(tempPath, databasePath);
  });
  await databaseWriteQueue;
}

export async function run(db, databasePath, sql, params = []) {
  db.run(sql, params);
  await persistDatabase(db, databasePath);
}
