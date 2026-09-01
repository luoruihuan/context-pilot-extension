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
          onRequestTabsPermission={app.requestTabsPermission}
          onRequestTabAccess={app.requestTabAccess}
          onSubmit={(message, tabIds) => void app.send(message, tabIds)}
          disclosureAccepted={app.disclosureAccepted}
          onAcceptDisclosure={app.acceptDisclosure}
          onRetry={(turnId) => void app.retry(turnId)}
          configured={Boolean(app.profile)}
          onOpenSettings={() => app.setView("settings")}
          streaming={app.chat.status === "extracting" || app.chat.status === "streaming"}
          errorMessage={app.chat.error?.message}
          persistenceWarning={app.chat.persistenceWarning}
          sourceErrors={app.chat.sourceErrors}
          usage={app.chat.usage}
          onStop={app.stop}
          readingTabs={app.chat.status === "extracting" ? app.selectedTabs.map((tab) => tab.tabId) : []}
          status={app.chat.status}
        />
      )}
      {app.view === "history" && (
        <HistoryView
          items={app.conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.turns.find((turn) => turn.role === "user")?.content ?? "未命名对话",
            updatedAt: conversation.updatedAt,
            turnCount: conversation.turns.length,
          }))}
          onBack={() => app.setView("chat")}
          onOpen={(id) => void app.openConversation(id)}
          onDelete={(id) => void app.deleteConversation(id)}
        />
      )}
      {app.view === "settings" && <SettingsView profiles={app.profiles} profile={app.profile} theme={app.theme} onThemeChange={app.setTheme} onBack={() => app.setView("chat")} onSave={app.saveProfile} onTest={app.testProfile} onSelect={app.selectProfile} onCreate={app.createProfile} onDelete={app.deleteProfile} />}
    </main>
  );
}

export function App() {
  return <AppProvider><Workspace /></AppProvider>;
}
