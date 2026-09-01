import type { ChatTurn } from "@/shared/types/domain";
import { cloneValue } from "./chrome-storage";

const DATABASE_NAME = "context-pilot";
const DATABASE_VERSION = 1;
const CONVERSATIONS_STORE = "conversations";

export interface Conversation {
  id: string;
  turns: ChatTurn[];
  createdAt: number;
  updatedAt: number;
}

export class ConversationRepository {
  private databasePromise: Promise<IDBDatabase> | undefined;

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = undefined;
  }

  async list(): Promise<Conversation[]> {
    const database = await this.getDatabase();
    const records = await requestToPromise(
      database.transaction(CONVERSATIONS_STORE, "readonly").objectStore(CONVERSATIONS_STORE).getAll(),
    );

    return records.map((record) => cloneValue(record as Conversation));
  }

  async get(id: string): Promise<Conversation | undefined> {
    const database = await this.getDatabase();
    const record = await requestToPromise(
      database.transaction(CONVERSATIONS_STORE, "readonly").objectStore(CONVERSATIONS_STORE).get(id),
    );

    return record === undefined ? undefined : cloneValue(record as Conversation);
  }

  async save(conversation: Conversation): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(CONVERSATIONS_STORE, "readwrite");
    transaction.objectStore(CONVERSATIONS_STORE).put(toStoredConversation(conversation));
    await transactionToPromise(transaction);
  }

  async delete(id: string): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(CONVERSATIONS_STORE, "readwrite");
    transaction.objectStore(CONVERSATIONS_STORE).delete(id);
    await transactionToPromise(transaction);
  }

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        request.result.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open conversation database"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function toStoredConversation(conversation: Conversation): Conversation {
  return {
    ...cloneValue(conversation),
    turns: conversation.turns.map((turn) => ({
      ...cloneValue(turn),
      sources: turn.sources.map(({ sourceId, title, url, extractedAt }) => ({
        sourceId,
        title,
        url,
        extractedAt,
      })),
    })),
  };
}
