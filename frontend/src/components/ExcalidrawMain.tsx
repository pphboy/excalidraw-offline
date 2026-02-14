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
  setSaveInfo,
}: {
  tab: Tab;
  isActive: boolean;
  autoSave: boolean;
  onAPIReady: (id: string, api: any) => void;
  setSaveInfo: (info: SaveInfo) => void;
}) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const apiRef = useRef<any>(null);
  const filePathRef = useRef(tab.filePath);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  filePathRef.current = tab.filePath;

  useEffect(() => {
    apiRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

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
      if (!autoSave) return;
      
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      autoSaveTimer.current = setTimeout(async () => {
        try {
          const api = apiRef.current;
          const filePath = filePathRef.current;
          if (!api || !filePath) return;
          
          const elements = api.getSceneElements();
          const appState = api.getAppState();
          const files = api.getFiles();
          
          const json = serializeAsJSON(elements, appState, files, "local");
          await SaveFile(filePath, json);
          const info: SaveInfo = { lastSaved: Date.now(), lastSavedBy: "auto" };
          saveSaveInfo(info);
          setSaveInfo(info);
        } catch (err) {
          console.error("AutoSave failed:", err);
        }
      }, 2000);
    };

    excalidrawAPI.onChange = handleChange;

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [excalidrawAPI, autoSave, setSaveInfo]);

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
  const activeTabRef = useRef<{ id: string; filePath: string; excalidrawAPI: any } | null>(null);

  const setSaveInfo = useCallback((info: SaveInfo) => {
    setSaveInfoState(info);
  }, []);

  const handleAPIReady = useCallback((id: string, api: any) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          if (activeTabRef.current?.id === id) {
            activeTabRef.current.excalidrawAPI = api;
          }
          return { ...t, excalidrawAPI: api };
        }
        return t;
      })
    );
  }, []);

  const handleOpenFile = async () => {
    try {
      const filePath = await ShowOpenFileDialog();
      if (!filePath) return;

      const existingTab = tabs.find((t) => t.filePath === filePath);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        activeTabRef.current = existingTab;
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
      activeTabRef.current = { id, filePath, excalidrawAPI: null };
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
      activeTabRef.current = { id, filePath: finalPath, excalidrawAPI: null };
      addRecent(finalPath, fileName);
      setShowRecents(false);
    } catch (err) {
      console.error("Failed to create file:", err);
    }
  };

  const handleCloseTab = async (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab?.excalidrawAPI) {
      try {
        const json = serializeAsJSON(
          tab.excalidrawAPI.getSceneElements(),
          tab.excalidrawAPI.getAppState(),
          tab.excalidrawAPI.getFiles(),
          "local"
        );
        await SaveFile(tab.filePath, json);
        const info: SaveInfo = { lastSaved: Date.now(), lastSavedBy: "auto" };
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
      if (newTabs.length > 0) {
        activeTabRef.current = newTabs[newTabs.length - 1];
      } else {
        activeTabRef.current = null;
      }
    }
  };

  const doSave = useCallback(async (tabId: string, isManual: boolean = false) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab?.excalidrawAPI || !tab.filePath) {
      console.error("No API or file path available for save");
      return;
    }
    
    try {
      const json = serializeAsJSON(
        tab.excalidrawAPI.getSceneElements(),
        tab.excalidrawAPI.getAppState(),
        tab.excalidrawAPI.getFiles(),
        "local"
      );
      await SaveFile(tab.filePath, json);
      const newInfo: SaveInfo = { lastSaved: Date.now(), lastSavedBy: isManual ? "manual" : "auto" };
      saveSaveInfo(newInfo);
      setSaveInfoState(newInfo);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [tabs]);

  const handleSave = useCallback(async () => {
    if (!activeTabId) return;
    await doSave(activeTabId, true);
  }, [activeTabId, doSave]);

  useEffect(() => {
    activeTabRef.current = tabs.find((t) => t.id === activeTabId) || null;
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
        activeTabRef.current = existingTab;
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
      activeTabRef.current = { id, filePath, excalidrawAPI: null };
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
          {saveInfo && (
            <span style={{ fontSize: "12px", color: "#888", marginLeft: "8px" }}>
              ({saveInfo.lastSavedBy === "auto" ? "Auto" : "Saved"} {formatTime(saveInfo.lastSaved)})
            </span>
          )}
        </label>
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
          setSaveInfo={setSaveInfo}
        />
      ))}
    </div>
  );
}
