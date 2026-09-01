export interface WaitForStableDomOptions {
  document: Document;
  quietMs?: number;
  maxWaitMs?: number;
}

const DEFAULT_QUIET_MS = 400;
const DEFAULT_MAX_WAIT_MS = 3000;

export function waitForStableDom({
  document,
  quietMs = DEFAULT_QUIET_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
}: WaitForStableDomOptions): Promise<void> {
  return new Promise((resolve) => {
    const MutationObserverConstructor = document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    if (!MutationObserverConstructor) {
      resolve();
      return;
    }

    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const observer = new MutationObserverConstructor(() => {
      scheduleQuietTimer();
    });

    const finish = () => {
      if (finished) return;
      finished = true;
      if (quietTimer) clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      observer.disconnect();
      resolve();
    };

    const scheduleQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    };

    const maxTimer = setTimeout(finish, maxWaitMs);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scheduleQuietTimer();
  });
}
