import { useCallback, useEffect, useState } from "react";

import {
  type LibraryMeta,
  listLibraries,
  getCurrentLibraryId,
  setCurrentLibraryId,
  onCurrentLibraryChange,
  saveLibraryOrder,
} from "./SharedLibraryAdapter";

/**
 * 管理素材库清单 + 当前选中库的 React hook。
 *
 * - 加载时从服务器拉取所有库（分类）的清单
 * - 暴露 currentId（当前选中的库）、libraries（清单）、select（切换）
 * - select 切换后，SharedLibraryAdapter 内部状态同步更新，
 *   LibraryMenuItems 通过 getItemLibraryId 按库过滤素材
 */
export const useLibraries = () => {
  const [libraries, setLibraries] = useState<LibraryMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(
    getCurrentLibraryId(),
  );

  // 拉取库清单
  const reload = useCallback(async () => {
    const libs = await listLibraries();
    setLibraries(libs);
    const current = getCurrentLibraryId();
    // 若当前库为空，或已不存在于清单（被删），回退到第一个
    if ((!current || !libs.some((l) => l.id === current)) && libs.length > 0) {
      setCurrentLibraryId(libs[0].id);
    }
    return libs;
  }, []);

  // 切换当前库
  const select = useCallback((id: string) => {
    setCurrentLibraryId(id);
  }, []);

  // 拖拽重排：立即更新本地顺序，并保存到服务器 index.json
  const reorder = useCallback(
    (orderedIds: string[]) => {
      // 本地立即重排，保证拖拽响应即时
      setLibraries((prev) => {
        const map = new Map(prev.map((l) => [l.id, l]));
        const next: LibraryMeta[] = [];
        for (const id of orderedIds) {
          const lib = map.get(id);
          if (lib) {
            next.push(lib);
          }
        }
        // 不在 orderedIds 里的（理论上不会）追加末尾
        for (const lib of prev) {
          if (!orderedIds.includes(lib.id)) {
            next.push(lib);
          }
        }
        return next;
      });
      // 保存到服务器（异步，失败只记日志，不打断拖拽）
      void saveLibraryOrder(orderedIds);
    },
    [],
  );

  // 订阅当前库变化（adapter 内部可能也会改 currentId，比如 load 时初始化）
  useEffect(() => {
    const unsub = onCurrentLibraryChange((id) => {
      setCurrentId(id);
    });
    return () => {
      unsub();
    };
  }, []);

  // 初始加载
  useEffect(() => {
    void reload();
  }, [reload]);

  return { libraries, currentId, select, reorder, reload };
};
