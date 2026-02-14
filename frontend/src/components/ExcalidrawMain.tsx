import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  OpenFile,
  SaveFile,
  ShowOpenFileDialog,
  ShowSaveFileDialog,
} from "../../wailsjs/go/main/App";

interface Tab {
  id: string;
  filePath: string;
  fileName: string;
  excalidrawAPI: any;
  initialData: any;
}

interface RecentFile {
  filePath: string;
  fileName: string;
  lastOpened: number;
}

interface SaveInfo {
  filePath: string;
  lastSaved: number;
  lastSavedBy: "auto" | "manual";
}

const RECENTS_KEY = "excalidraw-recents";
const SAVE_INFO_KEY = "excalidraw-save-info";

function getRecents(): RecentFile[] {
  try {
    const data = localStorage.getItem(RECENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveRecents(recents: RecentFile[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

function addRecent(filePath: string, fileName: string) {
  const recents = getRecents().filter((r) => r.filePath !== filePath);
  recents.unshift({ filePath, fileName, lastOpened: Date.now() });
  saveRecents(recents.slice(0, 10));
}

function getSaveInfo(): SaveInfo | null {
  try {
    const data = localStorage.getItem(SAVE_INFO_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function saveSaveInfo(info: SaveInfo) {
  localStorage.setItem(SAVE_INFO_KEY, JSON.stringify(info));
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function ExcalidrawTab({
  tab,
  isActive,
  onAPIReady,
  onContentChange,
}: {
  tab: Tab;
  isActive: boolean;
  onAPIReady: (id: string, api: any) => void;
  onContentChange: (tabId: string, filePath: string) => void;
}) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  useEffect(() => {
    if (excalidrawAPI) {
      onAPIReady(tab.id, excalidrawAPI);
    }
  }, [excalidrawAPI, tab.id, onAPIReady]);

  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleChange = () => {
      onContentChange(tab.id, tab.filePath);
    };

    excalidrawAPI.onChange = handleChange;
  }, [excalidrawAPI, tab.id, tab.filePath, onContentChange]);

  useEffect(() => {
    if (excalidrawAPI && isActive && tab.initialData) {
      try {
        excalidrawAPI.updateScene(tab.initialData);
      } catch (e) {
        console.error("Failed to load scene:", e);
      }
    }
  }, [excalidrawAPI, isActive, tab.initialData]);

  if (!isActive) return null;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Excalidraw
        excalidrawAPI={(api) => {
          setExcalidrawAPI(api);
        }}
      />
    </div>
  );
}

export function ExcalidrawMain() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(true);
  const [showRecents, setShowRecents] = useState(true);
  const [saveInfo, setSaveInfoState] = useState<SaveInfo | null>(getSaveInfo());
  const [, setUpdateCount] = useState(0);
  const tabsRef = useRef<Tab[]>([]);
  tabsRef.current = tabs;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(
    async (tabId: string, isManual: boolean = false) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab?.excalidrawAPI || !tab.filePath) {
        return;
      }

      try {
        const json = serializeAsJSON(
          tab.excalidrawAPI.getSceneElements(),
          tab.excalidrawAPI.getAppState(),
          tab.excalidrawAPI.getFiles(),
          "local",
        );
        await SaveFile(tab.filePath, json);
        const info: SaveInfo = {
          filePath: tab.filePath,
          lastSaved: Date.now(),
          lastSavedBy: isManual ? "manual" : "auto",
        };
        saveSaveInfo(info);
        setSaveInfoState(info);
      } catch (err) {
        console.error("Save failed:", err);
      }
    },
    [],
  );

  const handleAPIReady = useCallback((id: string, api: any) => {
    if (id === activeTabId) {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, excalidrawAPI: api } : t)),
      );
    }
  }, [activeTabId]);

  const handleContentChange = useCallback(
    (tabId: string, filePath: string) => {
      if (!autoSave) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        doSave(tabId, false);
      }, 2000);
    },
    [autoSave, doSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const openFile = useCallback(async (filePath: string) => {
    try {
      const existingTab = tabs.find((t) => t.filePath === filePath);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      const content = await OpenFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || "";
      const id = Date.now().toString();

      let initialData = null;
      try {
        initialData = JSON.parse(content);
      } catch {}

      const newTab: Tab = {
        id,
        filePath,
        fileName,
        excalidrawAPI: null,
        initialData,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      addRecent(filePath, fileName);
      setShowRecents(false);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  }, [tabs]);

  const handleOpenFile = async () => {
    try {
      const filePath = await ShowOpenFileDialog();
      if (!filePath) return;
      await openFile(filePath);
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleCreateFile = async () => {
    try {
      const filePath = await ShowSaveFileDialog("");
      if (!filePath) return;

      if (!filePath.trim()) {
        alert("Please enter a file name");
        return;
      }

      let finalPath = filePath;
      if (!finalPath.endsWith(".excalidraw")) {
        finalPath += ".excalidraw";
      }

      const emptyContent = serializeAsJSON([], { theme: "light" }, {}, "local");
      await SaveFile(finalPath, emptyContent);

      const fileName = finalPath.split(/[\\/]/).pop() || "";
      const id = Date.now().toString();

      const newTab: Tab = {
        id,
        filePath: finalPath,
        fileName,
        excalidrawAPI: null,
        initialData: null,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      addRecent(finalPath, fileName);
      setShowRecents(false);
    } catch (err) {
      console.error("Failed to create file:", err);
    }
  };

  const handleSave = useCallback(() => {
    if (!activeTabId) return;
    doSave(activeTabId, true);
  }, [activeTabId, doSave]);

  const handleCloseTab = async (id: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const tab = tabs.find((t) => t.id === id);
    if (tab?.excalidrawAPI && tab.filePath) {
      await doSave(id, false);
    }

    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      setActiveTabId(
        newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null,
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSaveInfoState(getSaveInfo());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRecentClick = async (filePath: string) => {
    await openFile(filePath);
  };

  const handleRemoveRecent = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    const recents = getRecents().filter((r) => r.filePath !== filePath);
    saveRecents(recents);
    setUpdateCount((c) => c + 1);
  };

  const recents = getRecents();
  const activeTabInfo = tabs.find((t) => t.id === activeTabId);
  const displayFilePath = activeTabInfo?.filePath || "";
  const displaySaveInfo =
    saveInfo?.filePath === displayFilePath ? saveInfo : null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px",
          gap: "8px",
          borderBottom: "1px solid #444",
          backgroundColor: "#1e1e1e",
        }}
      >
        <button onClick={handleOpenFile}>Open File</button>
        <button onClick={handleCreateFile}>Create File</button>
        <button onClick={handleSave} disabled={!activeTabId}>
          Save
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
          />
          AutoSave
        </label>
        {displayFilePath && (
          <span style={{ fontSize: "12px", color: "#888", marginLeft: "16px" }}>
            {displayFilePath}
          </span>
        )}
        {displaySaveInfo && (
          <span style={{ fontSize: "12px", color: "#888" }}>
            {displaySaveInfo.lastSavedBy === "auto" ? "Auto" : "Saved"}{" "}
            {formatTime(displaySaveInfo.lastSaved)}
          </span>
        )}
      </div>

      {tabs.length > 0 && (
        <div
          style={{
            display: "flex",
            backgroundColor: "#252526",
            borderBottom: "1px solid #444",
            overflowX: "auto",
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: activeTabId === tab.id ? "#1e1e1e" : "#2d2d2d",
                borderRight: "1px solid #444",
                cursor: "pointer",
                minWidth: "120px",
              }}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.fileName}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                style={{
                  marginLeft: "8px",
                  background: "none",
                  border: "none",
                  color: "#888",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showRecents || tabs.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          {recents.length > 0 && (
            <div>
              <h3>Recent Files</h3>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {recents.map((recent) => (
                  <div
                    key={recent.filePath}
                    onClick={() => handleRecentClick(recent.filePath)}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#2d2d2d",
                      cursor: "pointer",
                      borderRadius: "4px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      minWidth: "300px",
                    }}
                  >
                    <span>{recent.fileName}</span>
                    <span style={{ fontSize: "12px", color: "#888" }}>
                      {recent.filePath}
                    </span>
                    <button
                      onClick={(e) => handleRemoveRecent(e, recent.filePath)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        marginLeft: "8px",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recents.length === 0 && (
            <div style={{ color: "#888" }}>
              <p>No recent files</p>
              <p>Click "Open File" or "Create File" to get started</p>
            </div>
          )}
        </div>
      ) : null}

      {activeTabId && (
        <ExcalidrawTab
          key={activeTabId}
          tab={tabs.find((t) => t.id === activeTabId)!}
          isActive={true}
          onAPIReady={handleAPIReady}
          onContentChange={handleContentChange}
        />
      )}
    </div>
  );
}
