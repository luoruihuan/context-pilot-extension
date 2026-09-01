import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { ChatController } from "@/features/chat/chat-controller";
import type { ChatState } from "@/features/chat/chat-reducer";
import {
  contextReducer,
} from "@/features/context/context-reducer";
import { RuntimeClient } from "@/services/browser/runtime-client";
import { getProvider } from "@/services/llm/provider-registry";
import {
  ConversationRepository,
  ModelProfileRepository,
  type Conversation,
} from "@/services/storage";
import type { ModelProfile, TabReference } from "@/shared/types/domain";

type View = "chat" | "history" | "settings";

interface AppState {
  view: View;
  setView(view: View): void;
  tabs: TabReference[];
  selectedTabs: TabReference[];
  setSelectedTabs(tabs: TabReference[]): void;
  chat: ChatState;
  send(message: string, tabIds: number[]): Promise<void>;
  stop(): void;
  resetChat(): void;
  conversations: Conversation[];
  openConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  profiles: ModelProfile[];
  profile?: ModelProfile;
  selectProfile(id: string): void;
  createProfile(): void;
  saveProfile(profile: ModelProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  testProfile(profile: ModelProfile): Promise<void>;
  requestTabsPermission(): Promise<boolean>;
  requestTabAccess(tab: TabReference): Promise<boolean>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setCurrentView] = useState<View>("chat");
  const [context, dispatch] = useReducer(contextReducer, { selectedTabs: [] });
  const [tabs, setTabs] = useState<TabReference[]>([]);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [profile, setProfile] = useState<ModelProfile>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const services = useMemo(() => {
    const runtime = new RuntimeClient();
    const profiles = new ModelProfileRepository();
    const conversations = new ConversationRepository();
    const controller = new ChatController({
      extraction: runtime.extraction,
      getProfile: (profileId) => profiles.get(profileId),
      getProvider,
      conversations,
    });
    return { runtime, profiles, conversations, controller };
  }, []);
  const [chat, setChat] = useState<ChatState>(services.controller.getState());

  useEffect(() => {
    let active = true;
    const unsubscribe = services.controller.subscribe(setChat);
    void Promise.all([services.runtime.listTabs(), services.profiles.list()]).then(
      ([nextTabs, profiles]) => {
        if (!active) return;
        setTabs(nextTabs);
        setProfiles(profiles);
        const defaultProfile = profiles.find((item) => item.isDefault) ?? profiles[0];
        setProfile(defaultProfile);
        const currentTab = nextTabs.find((tab) => tab.isCurrent && tab.permission === "granted");
        if (currentTab) dispatch({ type: "replace", tabs: [currentTab] });
      },
      () => {
        if (active) setTabs([]);
      },
    );
    return () => {
      active = false;
      unsubscribe();
      services.controller.stop();
      services.conversations.close();
    };
  }, [services]);

  async function saveProfile(nextProfile: ModelProfile): Promise<void> {
    await services.profiles.save(nextProfile);
    setProfiles(await services.profiles.list());
    setProfile(nextProfile);
  }

  async function deleteProfile(id: string): Promise<void> {
    await services.profiles.delete(id);
    const nextProfiles = await services.profiles.list();
    setProfiles(nextProfiles);
    setProfile(nextProfiles.find((item) => item.isDefault) ?? nextProfiles[0]);
  }

  async function requestTabsPermission(): Promise<boolean> {
    const granted = await services.runtime.requestTabsPermission();
    if (granted) setTabs(await services.runtime.listTabs());
    return granted;
  }

  async function requestTabAccess(tab: TabReference): Promise<boolean> {
    const granted = await services.runtime.requestTabAccess(tab.tabId, tab.origin);
    if (granted) setTabs(await services.runtime.listTabs());
    return granted;
  }

  async function testProfile(nextProfile: ModelProfile): Promise<void> {
    await getProvider(nextProfile.provider).testConnection(nextProfile, new AbortController().signal);
  }

  async function refreshConversations(): Promise<void> {
    const items = await services.conversations.list();
    setConversations(items.sort((left, right) => right.updatedAt - left.updatedAt));
  }

  function setView(nextView: View): void {
    setCurrentView(nextView);
    if (nextView === "history") void refreshConversations();
  }

  async function openConversation(id: string): Promise<void> {
    const conversation = await services.conversations.get(id);
    if (!conversation) return;
    services.controller.restore(conversation);
    setCurrentView("chat");
  }

  async function deleteConversation(id: string): Promise<void> {
    await services.conversations.delete(id);
    await refreshConversations();
  }

  const value = useMemo<AppState>(
    () => ({
      view,
      setView,
      tabs,
      selectedTabs: context.selectedTabs,
      setSelectedTabs: (tabs) => dispatch({ type: "replace", tabs }),
      chat,
      send: (message, tabIds) => {
        if (!profile) return Promise.resolve();
        return services.controller.send({ text: message, tabIds: [...tabIds], profileId: profile.id });
      },
      stop: () => services.controller.stop(),
      resetChat: () => services.controller.reset(),
      conversations,
      openConversation,
      deleteConversation,
      profiles,
      profile,
      selectProfile: (id) => setProfile(profiles.find((item) => item.id === id)),
      createProfile: () => setProfile(undefined),
      saveProfile,
      deleteProfile,
      testProfile,
      requestTabsPermission,
      requestTabAccess,
    }),
    [chat, context.selectedTabs, conversations, profile, profiles, services, tabs, view],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}
