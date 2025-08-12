interface Message {
  id?: string;
  sender: string;
  timestamp: string;
  content: any;
  encrypted: boolean;
  attachments?: any[];
}

const DB_NAME = 'ChatMessagesDB';
const STORE_NAME = 'messages';
const DB_VERSION = 1;

export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Error opening IndexedDB');
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('roomId', 'roomId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function saveMessagesToDB(roomId: string, messages: Message[]): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Add roomId and ensure each message has an id
    const messagesWithRoomId = messages.map(msg => ({
      ...msg,
      roomId,
      id: msg.id || `${msg.sender}_${msg.timestamp}_${Math.random().toString(36).substring(2, 9)}`
    }));

    await Promise.all(messagesWithRoomId.map(msg => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(msg);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Error saving messages to IndexedDB:', error);
  }
}

export async function getMessagesFromDB(roomId: string): Promise<Message[]> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('roomId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(roomId));
      request.onsuccess = () => {
        const messages = request.result;
        // Sort by timestamp
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting messages from IndexedDB:', error);
    return [];
  }
}

export async function clearMessagesForRoom(roomId: string): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('roomId');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(roomId));
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error clearing messages from IndexedDB:', error);
  }
}
