import React, { useEffect, useRef, useState } from "react";

import { t } from "../i18n";

/**
 * 素材库分类切换标签栏。
 *
 * - 横向排列所有库（分类），点击切换当前库
 * - 右侧有"+"按钮新建库（弹出输入框）
 * - 右键标签弹出菜单：重命名 / 删除
 * - 多库模式下渲染；单库模式下不渲染
 *
 * 注意：全部用内联样式，避免被 Excalidraw 全局 button 重置样式覆盖。
 */
export const LibraryTabs = ({
  libraries,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onReorder,
}: {
  libraries: { id: string; name: string }[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate?: (name: string) => Promise<boolean> | boolean;
  onDelete?: (id: string) => Promise<boolean> | boolean;
  onRename?: (oldId: string, newName: string) => Promise<boolean> | boolean;
  onReorder?: (orderedIds: string[]) => void | Promise<boolean> | boolean;
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // 拖拽状态
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 右键菜单状态
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    libId: string;
    libName: string;
  } | null>(null);
  // 重命名输入状态
  const [renaming, setRenaming] = useState<{
    libId: string;
    value: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  // 关闭右键菜单（点击外部）
  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu]);

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

  const handleRenameSubmit = async () => {
    if (!renaming || !onRename) {
      setRenaming(null);
      return;
    }
    const newNameVal = renaming.value.trim();
    if (!newNameVal || newNameVal === renaming.libId) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    try {
      await onRename(renaming.libId, newNameVal);
    } finally {
      setBusy(false);
      setRenaming(null);
    }
  };

  const handleDeleteConfirm = async (libId: string, libName: string) => {
    if (!onDelete) {
      return;
    }
    const confirmMsg = (t("library.deleteConfirm") as string).replace(
      "{name}",
      libName,
    );
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setBusy(true);
    try {
      await onDelete(libId);
    } finally {
      setBusy(false);
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
          // 重命名模式：显示输入框替代标签
          if (renaming?.libId === lib.id) {
            return (
              <input
                key={lib.id}
                ref={renameInputRef}
                value={renaming.value}
                disabled={busy}
                onChange={(e) =>
                  setRenaming({ ...renaming, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenameSubmit();
                  } else if (e.key === "Escape") {
                    setRenaming(null);
                  }
                }}
                onBlur={handleRenameSubmit}
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
            );
          }
          return (
            <button
              key={lib.id}
              type="button"
              draggable={!!onReorder}
              onDragStart={(e) => {
                if (!onReorder) {
                  return;
                }
                setDragId(lib.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!onReorder || dragId === null) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (lib.id !== dragOverId) {
                  setDragOverId(lib.id);
                }
              }}
              onDrop={(e) => {
                if (!onReorder || dragId === null || dragId === lib.id) {
                  return;
                }
                e.preventDefault();
                // 重新排序：把 dragId 移到 lib.id 的位置
                const ids = libraries.map((l) => l.id);
                const fromIdx = ids.indexOf(dragId);
                const toIdx = ids.indexOf(lib.id);
                if (fromIdx === -1 || toIdx === -1) {
                  return;
                }
                const reordered = [...ids];
                const [moved] = reordered.splice(fromIdx, 1);
                reordered.splice(toIdx, 0, moved);
                setDragId(null);
                setDragOverId(null);
                void onReorder(reordered);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
              }}
              onClick={() => onSelect(lib.id)}
              onContextMenu={(e) => {
                if (!onDelete && !onRename) {
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  libId: lib.id,
                  libName: lib.name,
                });
              }}
              title={lib.name}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                border: "none",
                borderLeft:
                  dragOverId === lib.id && dragId !== lib.id
                    ? "2px solid #6965db"
                    : "none",
                background: active ? "#6965db" : "transparent",
                color: active ? "#ffffff" : "#444444",
                fontSize: "13px",
                lineHeight: "1.2",
                padding: "6px 12px",
                borderRadius: "6px",
                whiteSpace: "nowrap",
                cursor: "pointer",
                fontWeight: active ? 600 : 400,
                opacity: dragId === lib.id ? 0.4 : 1,
                transition: "opacity 0.1s",
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

      {/* 右键菜单 */}
      {menu && (
        <div
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            background: "#ffffff",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            padding: "4px",
            zIndex: 100000,
            minWidth: "120px",
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {onRename && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRenaming({ libId: menu.libId, value: menu.libName });
                setMenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                appearance: "none",
                border: "none",
                background: "transparent",
                color: "#1b1b1f",
                fontSize: "13px",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f0f0f0")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              ✏️ {t("library.rename") as string}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const { libId, libName } = menu;
                setMenu(null);
                void handleDeleteConfirm(libId, libName);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                appearance: "none",
                border: "none",
                background: "transparent",
                color: "#d32f2f",
                fontSize: "13px",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#fdecea")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              🗑 {t("library.delete") as string}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
