import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
import { validateModelBaseUrl } from "@/services/llm/url-policy";
import {
  ConversationRepository,
  ModelProfileRepository,
  PreferencesRepository,
  type Conversation,
} from "@/services/storage";
import type { ModelProfile, TabReference } from "@/shared/types/domain";
import type { Preferences } from "@/services/storage";
import type { ThemePreference } from "@/services/storage";

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
  disclosureAccepted: boolean;
  acceptDisclosure(): Promise<void>;
  retry(turnId: string): Promise<void>;
  canRetry(turnId: string): boolean;
  theme: ThemePreference;
  setTheme(theme: ThemePreference): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setCurrentView] = useState<View>("chat");
  const [context, dispatch] = useReducer(contextReducer, { selectedTabs: [] });
  const [tabs, setTabs] = useState<TabReference[]>([]);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [profile, setProfile] = useState<ModelProfile>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ theme: "system", disclosureAccepted: false });
  const preferencesRef = useRef(preferences);
  const services = useMemo(() => {
    const runtime = new RuntimeClient();
    const profiles = new ModelProfileRepository();
    const conversations = new ConversationRepository();
    const preferences = new PreferencesRepository();
    const controller = new ChatController({
      extraction: runtime.extraction,
      getProfile: (profileId) => profiles.get(profileId),
      getProvider,
      conversations,
    });
    return { runtime, profiles, conversations, preferences, controller };
  }, []);
  const [chat, setChat] = useState<ChatState>(services.controller.getState());

  useEffect(() => {
    preferencesRef.current = preferences;
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences]);

  async function requireOriginPermission(baseUrl: string): Promise<void> {
    validateModelBaseUrl(baseUrl);
    try {
      if (await services.runtime.requestOriginPermission(baseUrl)) return;
    } catch {
      // Chrome rejects native permission prompts in some automated and denied flows.
    }
    throw new Error("需要授权模型服务地址。请重试授权。");
  }

  useEffect(() => {
    let active = true;
    const unsubscribe = services.controller.subscribe(setChat);
    void Promise.all([services.runtime.listTabs(), services.profiles.list(), services.preferences.get()]).then(
      ([nextTabs, profiles, nextPreferences]) => {
        if (!active) return;
        setTabs(nextTabs);
        setProfiles(profiles);
        preferencesRef.current = nextPreferences;
        setPreferences(nextPreferences);
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
    await requireOriginPermission(nextProfile.baseUrl);
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
    await requireOriginPermission(nextProfile.baseUrl);
    await getProvider(nextProfile.provider).testConnection(nextProfile, new AbortController().signal);
  }

  async function acceptDisclosure(): Promise<void> {
    const nextPreferences = { ...preferences, disclosureAccepted: true };
    await services.preferences.save(nextPreferences);
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
  }

  async function setTheme(theme: ThemePreference): Promise<void> {
    const nextPreferences = { ...preferences, theme };
    await services.preferences.save(nextPreferences);
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
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
    services.controller.forgetConversation(id);
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
      send: async (message, tabIds) => {
        if (!profile || !preferencesRef.current.disclosureAccepted) return;
        await services.controller.send({ text: message, tabIds: [...tabIds], profileId: profile.id });
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
      disclosureAccepted: preferences.disclosureAccepted,
      acceptDisclosure,
      retry: (turnId) => services.controller.retry(turnId),
      canRetry: (turnId) => services.controller.canRetry(turnId),
      theme: preferences.theme,
      setTheme,
    }),
    [chat, context.selectedTabs, conversations, preferences, profile, profiles, services, tabs, view],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}
