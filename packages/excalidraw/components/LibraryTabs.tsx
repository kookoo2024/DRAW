import React, { useState } from "react";

import { t } from "../i18n";

/**
 * 素材库分类切换标签栏。
 *
 * - 横向排列所有库（分类），点击切换当前库
 * - 右侧有"+"按钮新建库（弹出输入框）
 * - 多库模式下渲染；单库模式下不渲染
 *
 * 注意：全部用内联样式，避免被 Excalidraw 全局 button 重置样式覆盖。
 */
export const LibraryTabs = ({
  libraries,
  currentId,
  onSelect,
  onCreate,
}: {
  libraries: { id: string; name: string }[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (name: string) => Promise<boolean> | boolean;
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !onCreate) {
      setCreating(false);
      setNewName("");
      return;
    }
    setBusy(true);
    try {
      const ok = await onCreate(name);
      if (ok) {
        onSelect(name);
      }
    } finally {
      setBusy(false);
      setCreating(false);
      setNewName("");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "8px 10px",
        borderBottom: "1px solid #e0e0e0",
        background: "#f8f9fa",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "4px",
          flex: 1,
          overflowX: "auto" as const,
        }}
      >
        {libraries.map((lib) => {
          const active = currentId === lib.id;
          return (
            <button
              key={lib.id}
              type="button"
              onClick={() => onSelect(lib.id)}
              title={lib.name}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                border: "none",
                background: active ? "#6965db" : "transparent",
                color: active ? "#ffffff" : "#444444",
                fontSize: "13px",
                lineHeight: "1.2",
                padding: "6px 12px",
                borderRadius: "6px",
                whiteSpace: "nowrap",
                cursor: "pointer",
                fontWeight: active ? 600 : 400,
              }}
            >
              {lib.name}
            </button>
          );
        })}
      </div>
      {onCreate && !creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          title={t("library.newLibrary") as string}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            border: "1px dashed #b0b0b0",
            background: "transparent",
            color: "#666666",
            fontSize: "16px",
            lineHeight: "1",
            width: "26px",
            height: "26px",
            borderRadius: "6px",
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
      )}
      {creating && (
        <input
          autoFocus
          value={newName}
          placeholder={t("library.newLibraryPlaceholder") as string}
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleCreate();
            } else if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
          onBlur={() => handleCreate()}
          style={{
            fontSize: "13px",
            padding: "5px 8px",
            border: "1px solid #6965db",
            borderRadius: "6px",
            background: "#ffffff",
            color: "#1b1b1f",
            width: "110px",
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
};
