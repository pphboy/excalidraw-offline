import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useState } from "react";

const UIOptions = {
  dockedSidebarBreakpoint: 200,
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    changeViewBackgroundColor: true,
    clearCanvas: true,
    toggleTheme: null,
    saveAsImage: true,
  },
  tools: {
    image: true,
  },
};

export function ExcalidrawCanvas() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Excalidraw
          // @ts-ignore
          UIOptions={UIOptions}
          excalidrawAPI={(api) => {
            setExcalidrawAPI(api);
          }}
        />
      </div>
    </div>
  );
}
