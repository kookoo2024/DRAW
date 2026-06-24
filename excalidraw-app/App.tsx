import {
  Excalidraw,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import {
  APP_NAME,
  EVENT,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  resolvablePromise,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import { useHandleLibrary } from "@excalidraw/excalidraw/data/library";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { FileId } from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import {
  Provider,
  appJotaiStore,
} from "./app-jotai";
import {
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import { importFromLocalStorage } from "./data/localStorage";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import {
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";

// 多素材库 adapter —— 从 /libraries/*.excalidrawlib 加载所有分类库，
// 并在增删素材时 POST 回写到对应库文件（浏览器直存服务器）。
import {
  SharedLibraryAdapter,
  fetchSharedLibraryItems,
  getItemLibraryId,
  createLibrary,
  deleteLibrary,
  renameLibrary,
  saveLibraryOrder,
} from "./data/SharedLibraryAdapter";
import { useLibraries } from "./data/useLibraries";

import { useAtomValue } from "./app-jotai";
import { AppFooter } from "./components/AppFooter";

import "./index.scss";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

/**
 * 把工具栏改造成可拖动浮窗：
 * - 注入一个拖动手柄（⠿）到工具栏最左侧
 * - pointerdown/move/up 实现拖动，更新 CSS 变量 --tb-left/--tb-top
 * - 双击手柄重置到底部居中
 * - 位置持久化到 localStorage
 * 返回一个 cleanup 函数（移除手柄 + 解绑事件）
 */
const setupDraggableToolbar = (
  toolbar: HTMLDivElement,
  storageKey: string,
): (() => void) => {
  // 已注入过则不重复
  if (toolbar.querySelector(".toolbar-drag-handle")) {
    return () => {};
  }

  // 创建手柄（6 个圆点，竖向排列）
  const handle = document.createElement("div");
  handle.className = "toolbar-drag-handle";
  handle.title = "拖动移动工具栏 · 双击重置到底部居中";
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("div");
    dot.className = "toolbar-drag-handle__dot";
    handle.appendChild(dot);
  }
  toolbar.insertBefore(handle, toolbar.firstChild);

  // 恢复上次保存的位置（存的是工具栏左上角坐标）
  const restorePos = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const { x, y } = JSON.parse(saved);
        applyCustomPos(x, y);
      }
    } catch {
      // ignore
    }
  };

  // 应用自定义位置（切到 custom-pos 态）
  // x, y = 工具栏左上角的视口坐标（对应 CSS left/top）
  const applyCustomPos = (x: number, y: number) => {
    toolbar.classList.add("toolbar-custom-pos");
    toolbar.style.setProperty("--tb-left", `${x}px`);
    toolbar.style.setProperty("--tb-top", `${y}px`);
  };

  // 重置到底部居中
  const resetPos = () => {
    toolbar.classList.remove("toolbar-custom-pos");
    toolbar.style.removeProperty("--tb-left");
    toolbar.style.removeProperty("--tb-top");
    localStorage.removeItem(storageKey);
  };

  restorePos();

  // 拖动逻辑：记录鼠标相对工具栏左上角的偏移，拖动时保持该偏移不变
  // 这样手柄始终贴着鼠标，符合直觉，不会"崩跑"
  let dragging = false;
  let grabOffsetX = 0; // 鼠标按下时，相对工具栏左上角的 x 偏移
  let grabOffsetY = 0; // 鼠标按下时，相对工具栏左上角的 y 偏移

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    handle.classList.add("dragging");
    const rect = toolbar.getBoundingClientRect();
    // 关键：记录鼠标抓的是工具栏的哪个位置
    grabOffsetX = e.clientX - rect.left;
    grabOffsetY = e.clientY - rect.top;
    // 立即切到自定义位置态（即使没移动也固定当前位置，避免跳动）
    applyCustomPos(rect.left, rect.top);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) {
      return;
    }
    e.preventDefault();
    // 工具栏左上角 = 鼠标位置 - 抓取偏移
    // 这样手柄跟随鼠标，工具栏整体不跳动
    const newX = e.clientX - grabOffsetX;
    const newY = e.clientY - grabOffsetY;
    // 约束在视口内（保证至少留出一部分可见）
    const w = toolbar.offsetWidth;
    const h = toolbar.offsetHeight;
    const minX = -w + 60; // 至少露出 60px
    const maxX = window.innerWidth - 60;
    const minY = 0;
    const maxY = window.innerHeight - 40;
    const clampedX = Math.max(minX, Math.min(maxX, newX));
    const clampedY = Math.max(minY, Math.min(maxY, newY));
    applyCustomPos(clampedX, clampedY);
  };

  const onPointerUp = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    handle.classList.remove("dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    // 持久化左上角坐标
    const rect = toolbar.getBoundingClientRect();
    try {
      localStorage.setItem(storageKey, JSON.stringify({ x: rect.left, y: rect.top }));
    } catch {
      // ignore
    }
  };

  // 双击重置
  const onDblClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetPos();
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("dblclick", onDblClick);

  // 返回 cleanup
  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("dblclick", onDblClick);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    if (handle.parentNode) {
      handle.parentNode.removeChild(handle);
    }
  };
};

const initializeScene = async (opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<{
  scene: ExcalidrawInitialDataState | null;
}> => {
  const localDataState = importFromLocalStorage();

  const scene: Omit<
    ExcalidrawInitialDataState,
    "files"
  > = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: {
      ...restoreAppState(localDataState?.appState, null),
      // 每次新启动时强制默认缩放为 68%
      zoom: { value: 0.68 as NormalizedZoomValue },
    },
  };

  return { scene };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  // 多分类库：库清单 + 当前选中库
  const { libraries, currentId, select, reorder, reload } = useLibraries();

  // 新建库后刷新清单并切到新库
  const handleCreateLibrary = useCallback(
    async (name: string) => {
      const ok = await createLibrary(name);
      if (ok) {
        await reload();
      }
      return ok;
    },
    [reload],
  );

  // 删除库后刷新清单，并切到第一个库
  const handleDeleteLibrary = useCallback(
    async (id: string) => {
      const ok = await deleteLibrary(id);
      if (ok) {
        const libs = await reload();
        // 切到剩余的第一个库
        if (libs.length > 0) {
          select(libs[0].id);
        }
      }
      return ok;
    },
    [reload, select],
  );

  // 重命名库后刷新清单并切到新名
  const handleRenameLibrary = useCallback(
    async (oldId: string, newName: string) => {
      const ok = await renameLibrary(oldId, newName);
      if (ok) {
        await reload();
        select(newName);
      }
      return ok;
    },
    [reload, select],
  );

  // 注入给 Excalidraw 的多库配置（让素材面板显示分类标签 + 按库过滤）
  // 必须 memoize：否则每次渲染都是新对象，会导致 LibraryMenuSection(memo)
  // 不断重挂载，渐进式渲染的 index 重置为 0，素材卡片永远不出现
  const libraryConfig = useMemo(
    () => ({
      libraries,
      currentLibraryId: currentId,
      onSelectLibrary: select,
      getItemLibraryId,
      onCreateLibrary: handleCreateLibrary,
      onDeleteLibrary: handleDeleteLibrary,
      onRenameLibrary: handleRenameLibrary,
      onReorderLibrary: reorder,
    }),
    [
      libraries,
      currentId,
      select,
      handleCreateLibrary,
      handleDeleteLibrary,
      handleRenameLibrary,
      reorder,
    ],
  );

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  useEffect(() => {
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      getVersion();
      void getFrame();
    }, VERSION_TIMEOUT);
  }, []);

  // 多素材库 + 浏览器直存：adapter 从 /libraries/*.excalidrawlib 加载所有库，
  // 并在增删素材时 POST 回写到对应库文件（save 不再是 no-op）。
  useHandleLibrary({
    excalidrawAPI,
    adapter: SharedLibraryAdapter,
  });

  // 手动重载所有素材库（面板里"重新加载"按钮触发）。
  // 重新拉取所有库文件并替换内存数据，让服务器的更新立即生效。
  const onReloadLibrary = useCallback(() => {
    if (!excalidrawAPI) {
      return;
    }
    void fetchSharedLibraryItems().then((libraryItems) => {
      excalidrawAPI.updateLibrary({
        // replace（非 merge），以服务器文件为唯一真相源
        libraryItems: libraryItems || [],
        merge: false,
        openLibraryMenu: true,
      });
    });
  }, [excalidrawAPI]);

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }

      if (isInitialLoad) {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (fileIds.length) {
          LocalData.fileStorage
            .getFiles(fileIds)
            .then(async ({ loadedFiles, erroredFiles }) => {
              if (loadedFiles.length) {
                excalidrawAPI.addFiles(loadedFiles);
              }
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
        // on fresh load, clear unused files from IDB (from previous session)
        LocalData.fileStorage.clearObsoleteFiles({
          currentFileIds: fileIds,
        });
      }
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    initializeScene({ excalidrawAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (!document.hidden) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [excalidrawAPI, setLangCode, loadImages]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          event.preventDefault();
          event.returnValue = "";
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    // this check is redundant, but since this is a hot path, it's best
    // not to evaluate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const updatedElements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, {
                  status: "saved",
                });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements: updatedElements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }
  };

  // ---------------------------------------------------------------------------
  // onExport — intercepts file save to wait for pending image loads
  // ---------------------------------------------------------------------------
  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      // Yield initial progress
      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      // Wait for all pending images to finish
      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  // Default-open the library sidebar on first load so the shared library is
  // immediately visible across all LAN clients.
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const appState = excalidrawAPI.getAppState();
    if (!appState.openSidebar) {
      excalidrawAPI.updateScene({
        appState: {
          openSidebar: { name: "default", tab: "library" },
        },
      });
    }
  }, [excalidrawAPI]);

  // 浮动可拖动工具栏：注入拖动手柄 + 绑定拖动逻辑
  // 位置持久化到 localStorage，刷新后恢复
  useEffect(() => {
    const STORAGE_KEY = "excalidraw-toolbar-pos";

    // 等待工具栏 DOM 出现（核心库异步渲染）
    let cleanup: (() => void) | null = null;
    let attempts = 0;
    const tryAttach = () => {
      const toolbar = document.querySelector<HTMLDivElement>(
        ".App-toolbar-container--floating",
      );
      if (toolbar) {
        cleanup = setupDraggableToolbar(toolbar, STORAGE_KEY);
        return;
      }
      if (++attempts < 40) {
        setTimeout(tryAttach, 150);
      }
    };
    tryAttach();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [excalidrawAPI]);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("excalidraw-app")}
    >
      <Excalidraw
        onChange={onChange}
        onExport={onExport}
        initialData={initialStatePromiseRef.current.promise}
        onReloadLibrary={onReloadLibrary}
        libraryConfig={libraryConfig}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
          },
        }}
        langCode={langCode}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        onThemeChange={setAppTheme}
      >
        <AppMainMenu theme={appTheme} />
        <AppWelcomeScreen />
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />

        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}
      </Excalidraw>
    </div>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawAPIProvider>
          <ExcalidrawWrapper />
        </ExcalidrawAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
