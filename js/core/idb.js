// Envoltorio mínimo de IndexedDB basado en promesas.

export function openDb(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de datos está abierta en otra pestaña. Cerrala y reintentá.'));
  });
}

export function deleteDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

const p = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
  });
}

export class Store {
  constructor(db) {
    this.db = db;
  }
  get(store, key) {
    return p(this.db.transaction(store).objectStore(store).get(key));
  }
  getAll(store, query, count) {
    return p(this.db.transaction(store).objectStore(store).getAll(query, count));
  }
  getAllFromIndex(store, index, query) {
    return p(this.db.transaction(store).objectStore(store).index(index).getAll(query));
  }
  count(store) {
    return p(this.db.transaction(store).objectStore(store).count());
  }
  put(store, value, key) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    return txDone(tx);
  }
  add(store, value) {
    const tx = this.db.transaction(store, 'readwrite');
    const r = p(tx.objectStore(store).add(value));
    return txDone(tx).then(() => r);
  }
  delete(store, key) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return txDone(tx);
  }
  clear(store) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return txDone(tx);
  }
  /** Escritura masiva en lotes para no bloquear la interfaz. */
  async bulkPut(store, values, chunk = 2000) {
    for (let i = 0; i < values.length; i += chunk) {
      const tx = this.db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const v of values.slice(i, i + chunk)) os.put(v);
      await txDone(tx);
    }
  }
}
