// /src/lib/photoStore.ts
export type PhotoRecord = {
  hash: string; // 64hex
  createdAt: number; // ms epoch
  blob: Blob;
};

export const DB_NAME = "shave-proof-db";
export const STORE_NAME = "photos";
export const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // 既存storeがなければ作る
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "hash" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putPhoto(rec: PhotoRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(rec);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getPhoto(hash: string): Promise<PhotoRecord | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const result = await new Promise<any>((resolve, reject) => {
      const req = store.get(hash);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    return result as PhotoRecord | undefined;
  } finally {
    db.close();
  }
}

/**
 * ✅ ダンプ用：このアプリが実際に使っているDB/Storeから全件取得
 */
export async function getAllPhotos(): Promise<PhotoRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const rows = await new Promise<any[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    return (rows as PhotoRecord[]).sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function getDbInfo(): Promise<{ dbName: string; version: number; stores: string[] }> {
  const db = await openDb();
  try {
    return {
      dbName: db.name,
      version: db.version,
      stores: Array.from(db.objectStoreNames),
    };
  } finally {
    db.close();
  }
}
