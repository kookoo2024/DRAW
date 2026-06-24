import { loadLibraryFromBlob } from "@excalidraw/excalidraw/data/blob";
import type {
  LibraryPersistenceAdapter,
  LibraryPersistedData,
} from "@excalidraw/excalidraw/data/library";
import type {
  LibraryItems,
  LibraryItems_anyVersion,
  LibraryItem,
} from "@excalidraw/excalidraw/types";

/**
 * 多素材库 + 浏览器直存方案
 *
 * 服务器侧（FireCloud 已支持，无需改源码）：
 *   GET  /api/list?path=libraries        → 列出所有库文件
 *   GET  /libraries/<name>.excalidrawlib → 读某个库
 *   POST /api/upload?path=libraries/<name>.excalidrawlib → 写某个库
 *
 * 每个分类库 = libraries 目录下一个 .excalidrawlib 文件。
 * 库清单（id/显示名/排序）由这些文件推导：
 *   - 文件名（去扩展名）即库的显示名，同时也是 id
 *   - 例如 "数学.excalidrawlib" → id="数学", name="数学"
 *
 * Excalidraw 的 LibraryItem 没有"属于哪个库"的字段，所以我们用一个
 * 内存映射 itemId → libraryId 来追踪每个素材属于哪个库，这样 save()
 * 时能把变更正确回写到对应的库文件。
 */

const LIBRARIES_DIR = "libraries";

/** 库清单条目：一个分类库的描述 */
export type LibraryMeta = {
  /** 库 id = 文件名（不含扩展名）*/
  id: string;
  /** 显示名（= id，中文文件名即中文显示名）*/
  name: string;
};

/** 当前选中的库 id（模块级状态，跨组件共享；持久化到 localStorage）*/
const CURRENT_LIB_STORAGE_KEY = "excalidraw-library:currentLibId";
let currentLibraryId: string | null =
  localStorage.getItem(CURRENT_LIB_STORAGE_KEY) || null;

/** 监听当前库变化的订阅者 */
type LibraryChangeListener = (id: string) => void;
const libraryChangeListeners = new Set<LibraryChangeListener>();

export const onCurrentLibraryChange = (fn: LibraryChangeListener) => {
  libraryChangeListeners.add(fn);
  return () => libraryChangeListeners.delete(fn);
};

export const getCurrentLibraryId = () => currentLibraryId;

export const setCurrentLibraryId = (id: string) => {
  if (currentLibraryId === id) {
    return;
  }
  currentLibraryId = id;
  try {
    localStorage.setItem(CURRENT_LIB_STORAGE_KEY, id);
  } catch {
    // localStorage 不可用时忽略
  }
  for (const fn of libraryChangeListeners) {
    fn(id);
  }
};

/** itemId → libraryId 的映射，记录每个素材属于哪个库 */
const itemLibraryMap = new Map<LibraryItem["id"], string>();

/** 防止并发写：串行化保存请求 */
let saveChain: Promise<void> = Promise.resolve();

/** 列出服务器上所有库文件（按 index.json 的顺序，无则按拼音）*/
export const listLibraries = async (): Promise<LibraryMeta[]> => {
  try {
    const res = await fetch(`/api/list?path=${LIBRARIES_DIR}`, {
      cache: "no-cache",
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    const files: Array<{ name: string; isDir: boolean }> = data.files || [];
    // 只取 .excalidrawlib 文件
    const libs = files
      .filter((f) => !f.isDir && f.name.endsWith(".excalidrawlib"))
      .map((f) => {
        const name = f.name.replace(/\.excalidrawlib$/i, "");
        return { id: name, name };
      });

    // 读 index.json 获取自定义顺序（服务器可能没有，catch 掉即可）
    let order: string[] | null = null;
    try {
      const orderRes = await fetch(`/${LIBRARIES_DIR}/index.json`, {
        cache: "no-cache",
      });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        if (Array.isArray(orderData.order)) {
          order = orderData.order as string[];
        }
      }
    } catch {
      // index.json 不存在或解析失败，用默认顺序
    }

    if (order) {
      // 按 index.json 排序：order 里的按顺序，不在 order 里的追加到末尾（按拼音）
      const inOrder: LibraryMeta[] = [];
      const rest: LibraryMeta[] = [];
      for (const id of order) {
        const found = libs.find((l) => l.id === id);
        if (found) {
          inOrder.push(found);
        }
      }
      for (const lib of libs) {
        if (!order.includes(lib.id)) {
          rest.push(lib);
        }
      }
      rest.sort((a, b) => a.name.localeCompare(b.name, "zh"));
      return [...inOrder, ...rest];
    }

    // 无 index.json，按拼音排序
    return libs.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  } catch (error: any) {
    console.error(`[SharedLibraryAdapter] listLibraries failed: ${error?.message}`);
    return [];
  }
};

/** 保存库的自定义顺序到服务器 index.json */
export const saveLibraryOrder = async (
  orderedIds: string[],
): Promise<boolean> => {
  try {
    const payload = JSON.stringify({ order: orderedIds });
    const path = encodeURIComponent(`${LIBRARIES_DIR}/index.json`);
    const res = await fetch(`/api/upload?path=${path}`, {
      method: "POST",
      body: payload,
    });
    return res.ok;
  } catch (error: any) {
    console.error(`[SharedLibraryAdapter] saveLibraryOrder failed: ${error?.message}`);
    return false;
  }
};

/** 拉取并解析单个库文件 */
const fetchLibraryFile = async (
  libraryId: string,
): Promise<LibraryItems_anyVersion | null> => {
  const fileName = encodeURIComponent(`${libraryId}.excalidrawlib`);
  const url = `/${LIBRARIES_DIR}/${fileName}`;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      console.warn(`[SharedLibraryAdapter] ${url} returned ${response.status}`);
      return null;
    }
    const blob = await response.blob();
    return await loadLibraryFromBlob(blob, "published");
  } catch (error: any) {
    console.error(`[SharedLibraryAdapter] load ${url} failed: ${error?.message}`);
    return null;
  }
};

/** 写入单个库文件到服务器 */
const uploadLibraryFile = async (
  libraryId: string,
  items: LibraryItems,
): Promise<void> => {
  const payload = JSON.stringify({
    type: "excalidrawlib",
    version: 2,
    source: window.location.origin,
    libraryItems: items,
  });
  const path = encodeURIComponent(`${LIBRARIES_DIR}/${libraryId}.excalidrawlib`);
  const res = await fetch(`/api/upload?path=${path}`, {
    method: "POST",
    body: payload,
  });
  if (!res.ok) {
    throw new Error(`upload ${libraryId} returned ${res.status}`);
  }
};

/** 删除服务器上的某个库文件 */
const deleteLibraryFile = async (libraryId: string): Promise<void> => {
  const path = encodeURIComponent(`${LIBRARIES_DIR}/${libraryId}.excalidrawlib`);
  const res = await fetch(`/api/delete?path=${path}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`delete ${libraryId} returned ${res.status}`);
  }
};

/**
 * 从服务器拉取所有库，合并成一个 LibraryItems 数组。
 * 同时维护 itemLibraryMap，记录每个素材属于哪个库。
 * 返回给 Excalidraw 作为统一的库数据。
 */
const loadAllLibraries = async (): Promise<LibraryItems> => {
  const libs = await listLibraries();
  if (libs.length === 0) {
    return [];
  }

  const results = await Promise.all(
    libs.map(async (lib) => {
      const items = await fetchLibraryFile(lib.id);
      return { lib, items };
    }),
  );

  const merged: LibraryItem[] = [];
  for (const { lib, items } of results) {
    if (!items) {
      continue;
    }
    for (const item of items as LibraryItems) {
      // 记录归属
      itemLibraryMap.set(item.id, lib.id);
      merged.push(item);
    }
  }

  // 初始化当前选中库：若 localStorage 里记录的库已不存在，回退到第一个
  if (currentLibraryId && !libs.some((l) => l.id === currentLibraryId)) {
    setCurrentLibraryId(libs[0].id);
  } else if (!currentLibraryId && libs.length > 0) {
    setCurrentLibraryId(libs[0].id);
  }

  return merged;
};

/**
 * 把变更后的完整库列表按 libraryId 分组，分别回写到对应库文件。
 * Excalidraw 每次增删素材都会调用 save() 传入完整数组。
 */
const saveAllLibraries = async (libraryItems: LibraryItems): Promise<void> => {
  // 先根据 itemLibraryMap 把 items 分组
  const grouped = new Map<string, LibraryItem[]>();
  for (const item of libraryItems) {
    const libId = itemLibraryMap.get(item.id) || currentLibraryId;
    if (!libId) {
      continue;
    }
    // 新加入的 item（map 里没有）归到当前选中库
    if (!itemLibraryMap.has(item.id)) {
      itemLibraryMap.set(item.id, libId);
    }
    if (!grouped.has(libId)) {
      grouped.set(libId, []);
    }
    grouped.get(libId)!.push(item);
  }

  // 清理 map 里已删除的 item
  const currentItemIds = new Set(libraryItems.map((i) => i.id));
  for (const id of Array.from(itemLibraryMap.keys())) {
    if (!currentItemIds.has(id)) {
      itemLibraryMap.delete(id);
    }
  }

  // 逐个库文件上传（串行，避免并发冲突）
  const uploadTasks: Promise<void>[] = [];
  for (const [libId, items] of grouped) {
    uploadTasks.push(uploadLibraryFile(libId, items));
  }
  await Promise.all(uploadTasks);
};

export const SharedLibraryAdapter: LibraryPersistenceAdapter = {
  async load() {
    const libraryItems = await loadAllLibraries();
    return libraryItems.length ? { libraryItems } : null;
  },
  async save(data: LibraryPersistedData) {
    // 串行化，避免快速连续保存时请求乱序
    saveChain = saveChain
      .then(() => saveAllLibraries(data.libraryItems as LibraryItems))
      .catch((error: any) => {
        console.error(`[SharedLibraryAdapter] save failed: ${error?.message}`);
      });
    await saveChain;
  },
};

/**
 * 重新加载某个库的内容（用于切库后刷新当前显示）。
 * 返回该库的素材列表。
 */
export const reloadLibraryItems = async (
  libraryId: string,
): Promise<LibraryItems> => {
  const items = await fetchLibraryFile(libraryId);
  return (items as LibraryItems) || [];
};

/**
 * 新建一个库（分类）。在服务器创建一个空库文件。
 * 返回成功与否。
 */
export const createLibrary = async (name: string): Promise<boolean> => {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  try {
    await uploadLibraryFile(trimmed, []);
    return true;
  } catch (error: any) {
    console.error(`[SharedLibraryAdapter] createLibrary failed: ${error?.message}`);
    return false;
  }
};

/**
 * 删除一个库（分类）。先从服务器删文件，再清理内存映射。
 * 返回剩余库的清单，供 UI 刷新。
 */
export const deleteLibrary = async (
  libraryId: string,
): Promise<boolean> => {
  try {
    await deleteLibraryFile(libraryId);
    // 清理该库的 item 映射
    for (const [itemId, libId] of Array.from(itemLibraryMap.entries())) {
      if (libId === libraryId) {
        itemLibraryMap.delete(itemId);
      }
    }
    return true;
  } catch (error: any) {
    console.error(`[SharedLibraryAdapter] deleteLibrary failed: ${error?.message}`);
    return false;
  }
};

/**
 * 重命名一个库（分类）。
 * 策略：拉取旧库内容 → 上传到新名 → 删除旧名 → 更新映射。
 */
export const renameLibrary = async (
  oldId: string,
  newName: string,
): Promise<boolean> => {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldId) {
    return false;
  }
  try {
    const items = await fetchLibraryFile(oldId);
    await uploadLibraryFile(trimmed, (items as LibraryItems) || []);
    await deleteLibraryFile(oldId);
    // 更新映射：旧库的 item 归属改到新库
    for (const [itemId, libId] of Array.from(itemLibraryMap.entries())) {
      if (libId === oldId) {
        itemLibraryMap.set(itemId, trimmed);
      }
    }
    return true;
  } catch (error: any) {
    console.error(`[SharedLibraryAdapter] renameLibrary failed: ${error?.message}`);
    return false;
  }
};

/**
 * 重载所有库的素材（用于"重新加载"按钮）。
 * 重新拉取所有库文件并更新映射。
 */
export const fetchSharedLibraryItems = async (): Promise<LibraryItems_anyVersion | null> => {
  const items = await loadAllLibraries();
  return items.length ? items : null;
};

/**
 * 查询某个素材属于哪个库（供 UI 按库过滤显示用）。
 * 依赖 itemLibraryMap，仅在 load() 之后有效。
 */
export const getItemLibraryId = (itemId: LibraryItem["id"]): string | null => {
  return itemLibraryMap.get(itemId) || null;
};
