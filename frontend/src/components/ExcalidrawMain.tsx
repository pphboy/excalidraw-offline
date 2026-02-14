import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { OpenFile, SaveFile, ShowOpenFileDialog, ShowSaveFileDialog } from "../../wailsjs/go/main/App";

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
  autoSave,
  onAPIReady,
  onContentChange,
}: {
  tab: Tab;
  isActive: boolean;
  autoSave: boolean;
  onAPIReady: (id: string, api: any) => void;
  onContentChange: (tabId: string) => void;
}) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (excalidrawAPI && !loadedRef.current) {
      loadedRef.current = true;
      if (tab.initialData) {
        try {
          excalidrawAPI.updateScene(tab.initialData);
        } catch (e) {
          console.error("Failed to load scene:", e);
        }
      }
    }
  }, [excalidrawAPI, tab.initialData]);

  useEffect(() => {
    if (excalidrawAPI) {
      onAPIReady(tab.id, excalidrawAPI);
    }
  }, [excalidrawAPI, tab.id, onAPIReady]);

  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleChange = () => {
      onContentChange(tab.id);
    };

    excalidrawAPI.onChange = handleChange;
  }, [excalidrawAPI, tab.id, onContentChange]);

  if (!isActive) return null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
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
  
  const autoSaveTimers = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const currentFilePath = activeTab?.filePath || "";

  const setSaveInfo = useCallback((info: SaveInfo) => {
    setSaveInfoState(info);
  }, []);

  const handleAPIReady = useCallback((id: string, api: any) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, excalidrawAPI: api } : t))
    );
  }, []);

  const handleContentChange = useCallback((tabId: string) => {
    if (!autoSave) return;
    
    if (autoSaveTimers.current[tabId]) {
      clearTimeout(autoSaveTimers.current[tabId]);
    }
    
    autoSaveTimers.current[tabId] = setTimeout(async () => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab?.excalidrawAPI || !tab.filePath) {
        console.error("No API or file path for save, tab:", tab);
        return;
      }
      
      try {
        const json = serializeAsJSON(
          tab.excalidrawAPI.getSceneElements(),
          tab.excalidrawAPI.getAppState(),
          tab.excalidrawAPI.getFiles(),
          "local"
        );
        console.log("AutoSave to:", tab.filePath);
        await SaveFile(tab.filePath, json);
        const info: SaveInfo = { filePath: tab.filePath, lastSaved: Date.now(), lastSavedBy: "auto" };
        saveSaveInfo(info);
        setSaveInfoState(info);
      } catch (err) {
        console.error("AutoSave failed:", err);
      }
    }, 2000);
  }, [tabs, autoSave]);

  useEffect(() => {
    return () => {
      Object.values(autoSaveTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleOpenFile = async () => {
    try {
      const filePath = await ShowOpenFileDialog();
      if (!filePath) return;

      const existingTab = tabs.find((t) => t.filePath === filePath);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      const content = await OpenFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || "untitled";
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
  };

  const handleCreateFile = async () => {
    try {
      const defaultName = "untitled.excalidraw";
      const filePath = await ShowSaveFileDialog(defaultName);
      if (!filePath) return;

      let finalPath = filePath;
      if (!finalPath.endsWith(".excalidraw")) {
        finalPath += ".excalidraw";
      }

      const emptyContent = serializeAsJSON([], { theme: "light" }, {}, "local");
      await SaveFile(finalPath, emptyContent);

      const fileName = finalPath.split(/[\\/]/).pop() || "untitled";
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

  const handleCloseTab = async (id: string) => {
    if (autoSaveTimers.current[id]) {
      clearTimeout(autoSaveTimers.current[id]);
      delete autoSaveTimers.current[id];
    }
    
    const tab = tabs.find((t) => t.id === id);
    if (tab?.excalidrawAPI && tab.filePath) {
      try {
        const json = serializeAsJSON(
          tab.excalidrawAPI.getSceneElements(),
          tab.excalidrawAPI.getAppState(),
          tab.excalidrawAPI.getFiles(),
          "local"
        );
        await SaveFile(tab.filePath, json);
        const info: SaveInfo = { filePath: tab.filePath, lastSaved: Date.now(), lastSavedBy: "auto" };
        saveSaveInfo(info);
        setSaveInfoState(info);
      } catch (err) {
        console.error("Close tab save failed:", err);
      }
    }

    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  const handleSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.excalidrawAPI && tab.filePath) {
      try {
        const json = serializeAsJSON(
          tab.excalidrawAPI.getSceneElements(),
          tab.excalidrawAPI.getAppState(),
          tab.excalidrawAPI.getFiles(),
          "local"
        );
        console.log("Manual save to:", tab.filePath);
        await SaveFile(tab.filePath, json);
        const info: SaveInfo = { filePath: tab.filePath, lastSaved: Date.now(), lastSavedBy: "manual" };
        saveSaveInfo(info);
        setSaveInfoState(info);
      } catch (err) {
        console.error("Save failed:", err);
      }
    } else {
      console.error("No active tab or API, activeTabId:", activeTabId, "tab:", tab);
    }
  }, [activeTabId, tabs]);

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
    try {
      const existingTab = tabs.find((t) => t.filePath === filePath);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      const content = await OpenFile(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || "untitled";
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
      console.error("Failed to open recent file:", err);
    }
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
  const displaySaveInfo = saveInfo?.filePath === displayFilePath ? saveInfo : null;

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
            {displaySaveInfo.lastSavedBy === "auto" ? "Auto" : "Saved"}: {formatTime(displaySaveInfo.lastSaved)}
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
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
          {recents.length > 0 && (
            <div>
              <h3>Recent Files</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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

      {tabs.map((tab) => (
        <ExcalidrawTab
          key={tab.id}
          tab={tab}
          isActive={activeTabId === tab.id}
          autoSave={autoSave}
          onAPIReady={handleAPIReady}
          onContentChange={handleContentChange}
        />
      ))}
    </div>
  );
}
