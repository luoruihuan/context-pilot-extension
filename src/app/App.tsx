import { History, MoreHorizontal, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/shared/components/IconButton";
import { ChatView } from "@/features/chat/ChatView";
import { HistoryView } from "@/features/history/HistoryView";
import { SettingsView } from "@/features/settings/SettingsView";
import { AppProvider, useApp } from "./AppProvider";
import styles from "./app.module.css";

function Workspace() {
  const app = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(action: () => void): void {
    setMenuOpen(false);
    action();
  }

  return (
    <main className={styles.app} aria-label="Context Pilot">
      <div className={styles.menuAnchor}>
        <IconButton label="更多操作" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <MoreHorizontal size={18} />
        </IconButton>
        <div className={styles.menu} role="menu" aria-label="应用操作" data-open={menuOpen}>
          <button type="button" role="menuitem" onClick={() => navigate(() => { app.resetChat(); app.setView("chat"); })}><Plus size={16} />新对话</button>
          <button type="button" role="menuitem" onClick={() => navigate(() => app.setView("history"))}><History size={16} />对话历史</button>
          <button type="button" role="menuitem" onClick={() => navigate(() => app.setView("settings"))}><Settings size={16} />设置</button>
        </div>
      </div>
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
          canRetry={app.canRetry}
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
