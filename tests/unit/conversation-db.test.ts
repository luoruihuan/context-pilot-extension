import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatTurn } from "@/shared/types/domain";
import { ConversationRepository } from "@/services/storage/conversation-db";

function conversationWithSourceMetadata(): { id: string; turns: ChatTurn[]; createdAt: number; updatedAt: number } {
  return {
    id: "c1",
    createdAt: 1,
    updatedAt: 2,
    turns: [
      {
        id: "turn-1",
        role: "user",
        content: "Summarize this",
        createdAt: 1,
        status: "complete",
        sources: [
          {
            sourceId: "page-1",
            title: "Private page",
            url: "https://example.com/private",
            extractedAt: 1,
            plainText: "secret page body",
          },
        ],
      } as unknown as ChatTurn,
    ],
  };
}

let repositories: ConversationRepository[];

beforeEach(() => {
  repositories = [];
});

afterEach(async () => {
  repositories.forEach((repository) => repository.close());
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("context-pilot");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("ConversationRepository", () => {
  it("does not persist page body content", async () => {
    const conversations = new ConversationRepository();
    repositories.push(conversations);

    await conversations.save(conversationWithSourceMetadata());

    expect(JSON.stringify(await conversations.get("c1"))).not.toContain("secret page body");
  });

  it("stores source metadata and returns a copy", async () => {
    const conversations = new ConversationRepository();
    repositories.push(conversations);
    await conversations.save(conversationWithSourceMetadata());

    const conversation = await conversations.get("c1");

    expect(conversation).toMatchObject({
      id: "c1",
      turns: [{ sources: [{ sourceId: "page-1", title: "Private page" }] }],
    });
    expect(conversation?.turns[0]?.sources[0]).not.toHaveProperty("plainText");
    if (conversation) {
      conversation.turns[0]!.content = "Changed by caller";
    }
    expect((await conversations.get("c1"))?.turns[0]?.content).toBe("Summarize this");
  });

  it("lists and deletes conversations", async () => {
    const conversations = new ConversationRepository();
    repositories.push(conversations);
    await conversations.save(conversationWithSourceMetadata());

    await expect(conversations.list()).resolves.toHaveLength(1);
    await conversations.delete("c1");

    await expect(conversations.list()).resolves.toEqual([]);
  });

  it("closes its database connection for cleanup", async () => {
    const conversations = new ConversationRepository();
    repositories.push(conversations);
    await conversations.save(conversationWithSourceMetadata());

    conversations.close();

    await expect(
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("context-pilot");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ).resolves.toBeUndefined();
  });
});
