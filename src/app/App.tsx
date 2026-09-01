import { History, Plus, Settings } from "lucide-react";
import { IconButton } from "@/shared/components/IconButton";
import { ChatView } from "@/features/chat/ChatView";
import { ContextChips } from "@/features/context/ContextChips";
import { HistoryView } from "@/features/history/HistoryView";
import { SettingsView } from "@/features/settings/SettingsView";
import { AppProvider, useApp } from "./AppProvider";
import styles from "./app.module.css";

function Workspace() {
  const app = useApp();

  return (
    <main className={styles.app} aria-labelledby="app-title">
      <header className={styles.toolbar}>
        <div className={styles.brand}>
          <span>CP</span>
          <h1 id="app-title">Context Pilot</h1>
        </div>
        <nav aria-label="主要工具">
          <IconButton label="新对话" onClick={() => { app.resetChat(); app.setView("chat"); }}><Plus size={18} /></IconButton>
          <IconButton label="对话历史" onClick={() => app.setView("history")}><History size={17} /></IconButton>
          <IconButton label="设置" onClick={() => app.setView("settings")}><Settings size={17} /></IconButton>
        </nav>
      </header>
      <section className={styles.contextBand} aria-labelledby="context-title">
        <div className={styles.contextLabel}><strong id="context-title">当前上下文</strong><span>{app.selectedTabs.length}/10</span></div>
        <ContextChips tabs={app.selectedTabs} onRemove={(tabId) => app.setSelectedTabs(app.selectedTabs.filter((tab) => tab.tabId !== tabId))} />
      </section>
      {app.view === "chat" && (
        <ChatView
          turns={app.chat.turns}
          tabs={app.tabs}
          selectedTabs={app.selectedTabs}
          onTabsChange={app.setSelectedTabs}
          onSubmit={(message, tabIds) => void app.send(message, tabIds)}
          configured={Boolean(app.profile)}
          onOpenSettings={() => app.setView("settings")}
          streaming={app.chat.status === "extracting" || app.chat.status === "streaming"}
          errorMessage={app.chat.error?.message}
          sourceErrors={app.chat.sourceErrors}
          usage={app.chat.usage}
          onStop={app.stop}
        />
      )}
      {app.view === "history" && <HistoryView items={[]} onBack={() => app.setView("chat")} onOpen={() => app.setView("chat")} onDelete={() => undefined} />}
      {app.view === "settings" && <SettingsView profile={app.profile} onBack={() => app.setView("chat")} onSave={async (profile) => { await app.saveProfile(profile); app.setView("chat"); }} onTest={app.testProfile} />}
    </main>
  );
}

export function App() {
  return <AppProvider><Workspace /></AppProvider>;
}
