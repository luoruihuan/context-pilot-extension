import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  contextReducer,
  initialContextState,
} from "@/features/context/context-reducer";
import type { ChatTurn, ModelProfile, TabReference } from "@/shared/types/domain";

type View = "chat" | "history" | "settings";

interface AppState {
  view: View;
  setView(view: View): void;
  tabs: TabReference[];
  selectedTabs: TabReference[];
  setSelectedTabs(tabs: TabReference[]): void;
  turns: ChatTurn[];
  setTurns(turns: ChatTurn[]): void;
  profile?: ModelProfile;
  setProfile(profile: ModelProfile): void;
}

const AppContext = createContext<AppState | null>(null);

const demoTabs: TabReference[] = [
  {
    tabId: 1,
    windowId: 1,
    title: "当前页面",
    url: "https://example.com/current",
    origin: "https://example.com",
    isCurrent: true,
    permission: "granted",
  },
  {
    tabId: 2,
    windowId: 1,
    title: "产品研究资料",
    url: "https://docs.example.com/research",
    origin: "https://docs.example.com",
    isCurrent: false,
    permission: "required",
  },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("chat");
  const [context, dispatch] = useReducer(contextReducer, {
    selectedTabs: [demoTabs[0]!],
  });
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [profile, setProfile] = useState<ModelProfile>();
  const value = useMemo<AppState>(
    () => ({
      view,
      setView,
      tabs: demoTabs,
      selectedTabs: context.selectedTabs,
      setSelectedTabs: (tabs) => dispatch({ type: "replace", tabs }),
      turns,
      setTurns,
      profile,
      setProfile,
    }),
    [context.selectedTabs, profile, turns, view],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}

export { initialContextState };
