import clsx from "clsx";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import {
  duplicateElements,
  getCommonBounds,
  isBoundToContainer,
  newElementWith,
} from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  clearLibraryCatalogCache,
  fetchGalleryLibraryItems,
  getLibraryItemElements,
  loadLibraryCatalog,
} from "../data/libraryCatalog";

import "./LibraryGallery.scss";

import type {
  GalleryLibraryCatalog,
  GalleryLibraryItem,
} from "../data/libraryCatalog";

const RECENT_ITEMS_KEY = "excalidraw-library-gallery:recent";
const FAVORITE_ITEMS_KEY = "excalidraw-library-gallery:favorites";
const CONTINUOUS_INSERT_KEY = "excalidraw-library-gallery:continuous";
const LAST_VIEW_KEY = "excalidraw-library-gallery:view";
const MAX_RECENT_ITEMS = 12;

type GalleryView =
  | { type: "all" }
  | { type: "recent" }
  | { type: "favorites" }
  | { type: "category"; id: string };

const readStringArray = (key: string, max?: number): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    const values = parsed.filter(
      (value): value is string => typeof value === "string",
    );
    return max ? values.slice(0, max) : values;
  } catch {
    return [];
  }
};

const writeStringArray = (key: string, values: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // localStorage may be unavailable.
  }
};

const readRecentItems = () =>
  readStringArray(RECENT_ITEMS_KEY, MAX_RECENT_ITEMS);
const readFavoriteItems = () => readStringArray(FAVORITE_ITEMS_KEY);

const readContinuousInsert = () => {
  try {
    const stored = localStorage.getItem(CONTINUOUS_INSERT_KEY);
    // 课堂场景默认保持面板打开，方便连续插入多个素材。
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
};

const readSavedView = (): GalleryView => {
  try {
    const raw = localStorage.getItem(LAST_VIEW_KEY);
    if (raw === "recent") {
      return { type: "recent" };
    }
    if (raw === "favorites") {
      return { type: "favorites" };
    }
    if (raw?.startsWith("category:")) {
      const id = raw.slice("category:".length);
      if (id) {
        return { type: "category", id };
      }
    }
  } catch {
    // localStorage may be unavailable.
  }
  return { type: "all" };
};

const serializeView = (view: GalleryView) =>
  view.type === "category" ? `category:${view.id}` : view.type;

const LibraryPreview = ({
  item,
  className,
}: {
  item: GalleryLibraryItem;
  className?: string;
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!item.previewUrl || failedUrl === item.previewUrl) {
    return (
      <div className={clsx("library-gallery__placeholder", className)}>
        {item.name.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={item.previewUrl}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedUrl(item.previewUrl)}
    />
  );
};

const ItemCard = ({
  item,
  busy,
  disabled,
  favorite,
  onInsert,
  onToggleFavorite,
  onPreview,
}: {
  item: GalleryLibraryItem;
  busy: boolean;
  disabled: boolean;
  favorite: boolean;
  onInsert: (item: GalleryLibraryItem) => void;
  onToggleFavorite: (item: GalleryLibraryItem) => void;
  onPreview: (item: GalleryLibraryItem) => void;
}) => {
  const favoriteLabel = favorite
    ? t("library.galleryUnfavorite")
    : t("library.galleryFavorite");

  return (
    <div
      className={clsx("library-gallery__item-card", {
        "is-busy": busy,
      })}
    >
      <button
        type="button"
        className="library-gallery__item-main"
        disabled={disabled}
        onClick={() => onInsert(item)}
        title={`${item.category} / ${item.name}`}
      >
        <div className="library-gallery__item-preview">
          <LibraryPreview item={item} className="library-gallery__item-image" />
        </div>
        <div className="library-gallery__item-meta">
          <span className="library-gallery__item-name">{item.name}</span>
          <span className="library-gallery__item-category">
            {item.category}
          </span>
        </div>
        <span className="library-gallery__item-insert">
          {busy ? t("library.galleryInserting") : t("library.galleryInsert")}
        </span>
      </button>
      <div className="library-gallery__item-actions">
        <button
          type="button"
          className={clsx("library-gallery__item-action", {
            "is-favorite": favorite,
          })}
          onClick={() => onToggleFavorite(item)}
          title={favoriteLabel}
          aria-label={favoriteLabel}
          aria-pressed={favorite}
        >
          {favorite ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="library-gallery__item-action"
          onClick={() => onPreview(item)}
          title={t("library.galleryPreview") as string}
          aria-label={t("library.galleryPreview") as string}
        >
          ⤢
        </button>
      </div>
    </div>
  );
};

const ItemGrid = ({
  items,
  busyItemId,
  favoriteIds,
  onInsert,
  onToggleFavorite,
  onPreview,
}: {
  items: GalleryLibraryItem[];
  busyItemId: string | null;
  favoriteIds: Set<string>;
  onInsert: (item: GalleryLibraryItem) => void;
  onToggleFavorite: (item: GalleryLibraryItem) => void;
  onPreview: (item: GalleryLibraryItem) => void;
}) => {
  return (
    <div className="library-gallery__item-grid">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          busy={busyItemId === item.id}
          disabled={busyItemId !== null}
          favorite={favoriteIds.has(item.id)}
          onInsert={onInsert}
          onToggleFavorite={onToggleFavorite}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
};

const PreviewDialog = ({
  item,
  busy,
  onClose,
  onInsert,
}: {
  item: GalleryLibraryItem;
  busy: boolean;
  onClose: () => void;
  onInsert: (item: GalleryLibraryItem) => void;
}) => {
  return (
    <div className="library-gallery__preview-backdrop" onClick={onClose}>
      <div
        className="library-gallery__preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("library.galleryPreviewTitle") as string}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="library-gallery__preview-header">
          <div>
            <h3>{item.name}</h3>
            <p>{item.category}</p>
          </div>
          <button
            type="button"
            className="library-gallery__preview-close"
            onClick={onClose}
            aria-label={t("library.galleryClose") as string}
            title={t("library.galleryClose") as string}
          >
            ×
          </button>
        </div>
        <div className="library-gallery__preview-stage">
          <LibraryPreview
            key={item.id}
            item={item}
            className="library-gallery__preview-image"
          />
        </div>
        <div className="library-gallery__preview-actions">
          <button
            type="button"
            className="library-gallery__preview-secondary"
            onClick={onClose}
          >
            {t("library.galleryClose")}
          </button>
          <button
            type="button"
            className="library-gallery__preview-primary"
            disabled={busy}
            onClick={() => onInsert(item)}
          >
            {busy
              ? t("library.galleryInserting")
              : t("library.galleryInsertToCanvas")}
          </button>
        </div>
      </div>
    </div>
  );
};

export const LibraryGallery = ({
  excalidrawAPI,
  onClose,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  onClose: () => void;
}) => {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState<GalleryLibraryCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<GalleryView>(readSavedView);
  const [continuousInsert, setContinuousInsert] =
    useState(readContinuousInsert);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>(readRecentItems);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(readFavoriteItems);
  const [previewItem, setPreviewItem] = useState<GalleryLibraryItem | null>(
    null,
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const activeCategory = useMemo(
    () =>
      view.type === "category"
        ? catalog?.categories.find((category) => category.id === view.id) ??
          null
        : null,
    [catalog, view],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!catalog || !normalizedQuery) {
      return [];
    }
    return catalog.items.filter((item) =>
      `${item.name} ${item.category}`.toLowerCase().includes(normalizedQuery),
    );
  }, [catalog, normalizedQuery]);

  const recentItems = useMemo(() => {
    if (!catalog) {
      return [];
    }
    const itemMap = new Map(catalog.items.map((item) => [item.id, item]));
    return recentIds
      .map((id) => itemMap.get(id))
      .filter((item): item is GalleryLibraryItem => !!item)
      .slice(0, 8);
  }, [catalog, recentIds]);

  const favoriteItems = useMemo(() => {
    if (!catalog) {
      return [];
    }
    const itemMap = new Map(catalog.items.map((item) => [item.id, item]));
    return favoriteIds
      .map((id) => itemMap.get(id))
      .filter((item): item is GalleryLibraryItem => !!item);
  }, [catalog, favoriteIds]);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  const closeGallery = useCallback(() => {
    excalidrawAPI?.updateScene({
      appState: {
        openSidebar: { name: "default", tab: "library" },
      },
    });
    onClose();
  }, [excalidrawAPI, onClose]);

  const loadCatalog = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const nextCatalog = await loadLibraryCatalog(undefined, force);
      setCatalog(nextCatalog);
    } catch (loadError: any) {
      if (loadError?.name !== "AbortError") {
        setError(loadError?.message || String(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog(false);
  }, [loadCatalog]);

  useEffect(() => {
    setPortalTarget(
      document.querySelector<HTMLElement>(".excalidraw") ?? document.body,
    );
  }, []);

  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) {
      searchInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_VIEW_KEY, serializeView(view));
    } catch {
      // localStorage may be unavailable.
    }
  }, [view]);

  useEffect(() => {
    if (
      catalog &&
      view.type === "category" &&
      !catalog.categories.some((category) => category.id === view.id)
    ) {
      setView({ type: "all" });
    }
  }, [catalog, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      if (previewItem) {
        setPreviewItem(null);
      } else if (query) {
        setQuery("");
      } else if (view.type !== "all") {
        setView({ type: "all" });
      } else {
        closeGallery();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeGallery, previewItem, query, view.type]);

  const rememberItem = useCallback((id: string) => {
    setRecentIds((previous) => {
      const next = [id, ...previous.filter((itemId) => itemId !== id)].slice(
        0,
        MAX_RECENT_ITEMS,
      );
      writeStringArray(RECENT_ITEMS_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (item: GalleryLibraryItem) => {
      const isFavorite = favoriteIds.includes(item.id);
      const next = isFavorite
        ? favoriteIds.filter((id) => id !== item.id)
        : [item.id, ...favoriteIds];
      setFavoriteIds(next);
      writeStringArray(FAVORITE_ITEMS_KEY, next);
      showToast(
        isFavorite
          ? t("library.galleryUnfavorited", { name: item.name })
          : t("library.galleryFavorited", { name: item.name }),
      );
    },
    [favoriteIds, showToast],
  );

  const toggleContinuousInsert = useCallback(() => {
    setContinuousInsert((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(CONTINUOUS_INSERT_KEY, String(next));
      } catch {
        // localStorage may be unavailable.
      }
      return next;
    });
  }, []);

  const insertItem = useCallback(
    async (item: GalleryLibraryItem) => {
      if (!excalidrawAPI || busyItemId) {
        return;
      }

      setBusyItemId(item.id);
      try {
        const libraryItems = await fetchGalleryLibraryItems(item);
        const elements = getLibraryItemElements(libraryItems);
        if (!elements.length) {
          throw new Error(t("library.galleryEmptyItem"));
        }

        const appState = excalidrawAPI.getAppState();
        const viewportCenter = viewportCoordsToSceneCoords(
          {
            clientX: appState.offsetLeft + appState.width / 2,
            clientY: appState.offsetTop + appState.height / 2,
          },
          appState,
        );
        const [minX, minY, maxX, maxY] = getCommonBounds(elements);
        const dx = viewportCenter.x - (minX + maxX) / 2;
        const dy = viewportCenter.y - (minY + maxY) / 2;

        const movedElements = elements.map((element) =>
          newElementWith(element, {
            x: element.x + dx,
            y: element.y + dy,
          }),
        );
        const { duplicatedElements } = duplicateElements({
          type: "everything",
          elements: movedElements,
          randomizeSeed: true,
          preserveFrameChildrenOrder: true,
        });

        excalidrawAPI.updateScene({
          elements: [
            ...excalidrawAPI.getSceneElementsIncludingDeleted(),
            ...duplicatedElements,
          ],
          appState: {
            selectedElementIds: Object.fromEntries(
              duplicatedElements
                .filter((element) => !isBoundToContainer(element))
                .map((element) => [element.id, true]),
            ),
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        excalidrawAPI.setActiveTool({ type: "selection" });

        rememberItem(item.id);
        showToast(
          t("library.galleryInserted", {
            name: item.name,
          }),
        );

        if (!continuousInsert) {
          window.setTimeout(closeGallery, 220);
        }
      } catch (insertError: any) {
        showToast(
          t("library.galleryInsertError", {
            message: insertError?.message || String(insertError),
          }),
        );
      } finally {
        setBusyItemId(null);
      }
    },
    [
      busyItemId,
      closeGallery,
      continuousInsert,
      excalidrawAPI,
      rememberItem,
      showToast,
    ],
  );

  const selectView = useCallback((next: GalleryView) => {
    setQuery("");
    setView(next);
  }, []);

  const resetToAll = useCallback(() => {
    selectView({ type: "all" });
  }, [selectView]);

  const selectCategory = useCallback(
    (id: string) => {
      selectView({ type: "category", id });
    },
    [selectView],
  );

  const refresh = useCallback(() => {
    clearLibraryCatalogCache();
    void loadCatalog(true);
  }, [loadCatalog]);

  const openPreview = useCallback((item: GalleryLibraryItem) => {
    setPreviewItem(item);
  }, []);

  const renderHeading = (title: string, count?: number) => (
    <div className="library-gallery__section-heading">
      <h3>{title}</h3>
      {count !== undefined && (
        <span>{t("library.galleryItems", { count })}</span>
      )}
    </div>
  );

  const renderEmpty = (title: string, message: string) => (
    <div className="library-gallery__status library-gallery__status--compact">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );

  const renderBody = () => {
    if (loading) {
      return (
        <div className="library-gallery__status">
          <span className="library-gallery__spinner" />
          {t("library.galleryLoading")}
        </div>
      );
    }

    if (error) {
      return (
        <div className="library-gallery__status">
          <strong>{t("library.galleryLoadError")}</strong>
          <span>{error}</span>
          <button type="button" onClick={refresh}>
            {t("library.galleryRetry")}
          </button>
        </div>
      );
    }

    if (normalizedQuery) {
      return (
        <section className="library-gallery__section">
          <div className="library-gallery__section-heading">
            <h3>
              {t("library.gallerySearchResults", {
                count: searchResults.length,
              })}
            </h3>
          </div>
          {searchResults.length ? (
            <ItemGrid
              items={searchResults}
              busyItemId={busyItemId}
              favoriteIds={favoriteIdSet}
              onInsert={insertItem}
              onToggleFavorite={toggleFavorite}
              onPreview={openPreview}
            />
          ) : (
            <div className="library-gallery__status">
              <strong>{t("library.galleryNoResults")}</strong>
              <span>{t("library.galleryNoResultsHint")}</span>
            </div>
          )}
        </section>
      );
    }

    if (view.type === "recent") {
      return (
        <section className="library-gallery__section">
          {renderHeading(t("library.galleryRecent"), recentItems.length)}
          {recentItems.length ? (
            <ItemGrid
              items={recentItems}
              busyItemId={busyItemId}
              favoriteIds={favoriteIdSet}
              onInsert={insertItem}
              onToggleFavorite={toggleFavorite}
              onPreview={openPreview}
            />
          ) : (
            renderEmpty(
              t("library.galleryRecent"),
              t("library.galleryRecentEmpty"),
            )
          )}
        </section>
      );
    }

    if (view.type === "favorites") {
      return (
        <section className="library-gallery__section">
          {renderHeading(t("library.galleryFavorites"), favoriteItems.length)}
          {favoriteItems.length ? (
            <ItemGrid
              items={favoriteItems}
              busyItemId={busyItemId}
              favoriteIds={favoriteIdSet}
              onInsert={insertItem}
              onToggleFavorite={toggleFavorite}
              onPreview={openPreview}
            />
          ) : (
            renderEmpty(
              t("library.galleryFavorites"),
              t("library.galleryFavoritesEmpty"),
            )
          )}
        </section>
      );
    }

    if (view.type === "category" && activeCategory) {
      return (
        <section className="library-gallery__section">
          {renderHeading(activeCategory.name, activeCategory.items.length)}
          {activeCategory.items.length ? (
            <ItemGrid
              items={activeCategory.items}
              busyItemId={busyItemId}
              favoriteIds={favoriteIdSet}
              onInsert={insertItem}
              onToggleFavorite={toggleFavorite}
              onPreview={openPreview}
            />
          ) : (
            renderEmpty(activeCategory.name, t("library.galleryCategoryEmpty"))
          )}
        </section>
      );
    }

    if (!catalog?.categories.length) {
      return (
        <div className="library-gallery__status">
          <strong>{t("library.galleryEmpty")}</strong>
          <span>{t("library.galleryEmptyHint")}</span>
        </div>
      );
    }

    return (
      <section className="library-gallery__section">
        {renderHeading(t("library.galleryAllItems"), catalog.items.length)}
        <ItemGrid
          items={catalog.items}
          busyItemId={busyItemId}
          favoriteIds={favoriteIdSet}
          onInsert={insertItem}
          onToggleFavorite={toggleFavorite}
          onPreview={openPreview}
        />
      </section>
    );
  };

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="library-gallery"
      role="dialog"
      aria-modal="true"
      aria-label={t("library.galleryTitle")}
    >
      <div className="library-gallery__header">
        <div className="library-gallery__title-row">
          <div>
            <h2>{t("library.galleryTitle")}</h2>
            <p>{t("library.gallerySubtitle")}</p>
          </div>
          <button
            type="button"
            className="library-gallery__close"
            onClick={closeGallery}
            aria-label={t("library.galleryClose")}
            title={t("library.galleryClose")}
          >
            ×
          </button>
        </div>

        <div className="library-gallery__toolbar">
          <input
            ref={searchInputRef}
            type="search"
            className="library-gallery__search"
            value={query}
            placeholder={t("library.gallerySearchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className={clsx("library-gallery__toggle", {
              "is-active": continuousInsert,
            })}
            aria-pressed={continuousInsert}
            onClick={toggleContinuousInsert}
          >
            {continuousInsert ? "✓ " : ""}
            {t("library.galleryContinuous")}
          </button>
          <button
            type="button"
            className="library-gallery__refresh"
            onClick={refresh}
          >
            {t("library.galleryRefresh")}
          </button>
        </div>
      </div>

      <div className="library-gallery__body">
        <aside
          className="library-gallery__rail"
          aria-label={t("library.galleryCategories") as string}
        >
          <button
            type="button"
            className={clsx("library-gallery__rail-item", {
              "is-active": view.type === "all" && !normalizedQuery,
            })}
            onClick={resetToAll}
          >
            {t("library.galleryAll")}
            <span>{catalog?.items.length ?? 0}</span>
          </button>
          <button
            type="button"
            className={clsx("library-gallery__rail-item", {
              "is-active": view.type === "recent" && !normalizedQuery,
            })}
            onClick={() => selectView({ type: "recent" })}
          >
            {t("library.galleryRecent")}
            <span>{recentItems.length}</span>
          </button>
          <button
            type="button"
            className={clsx("library-gallery__rail-item", {
              "is-active": view.type === "favorites" && !normalizedQuery,
            })}
            onClick={() => selectView({ type: "favorites" })}
          >
            {t("library.galleryFavorites")}
            <span>{favoriteItems.length}</span>
          </button>
          <div className="library-gallery__rail-divider" />
          <div className="library-gallery__rail-title">
            {t("library.galleryCategories")}
          </div>
          {catalog?.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={clsx("library-gallery__rail-item", {
                "is-active":
                  view.type === "category" &&
                  view.id === category.id &&
                  !normalizedQuery,
              })}
              onClick={() => selectCategory(category.id)}
            >
              {category.name}
              <span>{category.items.length}</span>
            </button>
          ))}
        </aside>
        <main className="library-gallery__main">{renderBody()}</main>
      </div>

      {previewItem && (
        <PreviewDialog
          item={previewItem}
          busy={busyItemId === previewItem.id}
          onClose={() => setPreviewItem(null)}
          onInsert={(item) => {
            setPreviewItem(null);
            void insertItem(item);
          }}
        />
      )}

      {toast && <div className="library-gallery__toast">{toast}</div>}
    </div>,
    portalTarget,
  );
};
