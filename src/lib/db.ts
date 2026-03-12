// IndexedDB setup for music library management
const DB_NAME = "MusicApp";
const DB_VERSION = 1;
const STORES = {
  PLAYLISTS: "playlists",
  PINNED: "pinned",
  SAVED_ALBUMS: "savedAlbums",
  SAVED_ARTISTS: "savedArtists",
};

export interface PlaylistItem {
  id: string;
  title: string;
  tracks: any[];
  duration: number;
  numberOfTracks: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface PinnedItem {
  id: string;
  type: "album" | "artist" | "history";
  title: string;
  data: any; // album object or [id, name, pic] for artist or {id, view, icon} for history
  createdAt?: number;
  updatedAt?: number;
}

export interface SavedAlbum {
  id: string;
  title: string;
  artists: any[];
  cover: string;
  releaseDate: string;
  numberOfTracks: number;
  data?: any; // Full album data
  savedAt?: number;
}

export interface SavedArtist {
  id: string;
  name: string;
  picture: string;
  data?: any; // Full artist data
  savedAt?: number;
}

let db: IDBDatabase;

/** Initialize the database */
export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create stores
      [STORES.PLAYLISTS, STORES.PINNED, STORES.SAVED_ALBUMS, STORES.SAVED_ARTISTS].forEach(
        (storeName) => {
          if (!database.objectStoreNames.contains(storeName)) {
            const store = database.createObjectStore(storeName, { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        },
      );
    };
  });
}

/** Get database instance, initialize if needed */
async function getDB(): Promise<IDBDatabase> {
  if (db) return db;
  return initDB();
}

// ─── Generic CRUD operations ─────────────────────────────────────────────

/** Get all items from a store */
export async function getAllItems<T>(storeName: string): Promise<T[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/** Get item by id from a store */
export async function getItemById<T>(storeName: string, id: string): Promise<T | undefined> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/** Save or update an item in a store */
export async function saveItem<T extends { id: string }>(
  storeName: string,
  item: T,
): Promise<void> {
  const database = await getDB();
  const now = Date.now();
  const itemToSave = {
    ...item,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .put(itemToSave);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/** Save multiple items in a store */
export async function saveItems<T extends { id: string }>(
  storeName: string,
  items: T[],
): Promise<void> {
  const database = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    items.forEach((item) => {
      const itemToSave = {
        ...item,
        updatedAt: now,
      };
      store.put(itemToSave);
    });

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

/** Delete an item from a store */
export async function deleteItem(storeName: string, id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/** Delete multiple items from a store */
export async function deleteItems(storeName: string, ids: string[]): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    ids.forEach((id) => store.delete(id));

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

/** Clear all items from a store */
export async function clearStore(storeName: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Export store names
export { STORES };
