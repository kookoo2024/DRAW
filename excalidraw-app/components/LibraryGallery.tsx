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
  GalleryLibraryCategory,
  GalleryLibraryItem,
} from "../data/libraryCatalog";

const RECENT_ITEMS_KEY = "excalidraw-library-gallery:recent";
const CONTINUOUS_INSERT_KEY = "excalidraw-library-gallery:continuous";
const MAX_RECENT_ITEMS = 12;

const readRecentItems = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === "string")
      .slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
};

const readContinuousInsert = () => {
  try {
    return localStorage.getItem(CONTINUOUS_INSERT_KEY) === "true";
  } catch {
    return false;
  }
};

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

const CategoryCard = ({
  category,
  onOpen,
}: {
  category: GalleryLibraryCategory;
  onOpen: (id: string) => void;
}) => {
  const previewItems = category.items.slice(0, 4);

  return (
    <button
      type="button"
      className="library-gallery__category-card"
      onClick={() => onOpen(category.id)}
    >
      <div
        className={clsx("library-gallery__category-cover", {
          "library-gallery__category-cover--single": previewItems.length === 1,
        })}
      >
        {previewItems.map((item) => (
          <LibraryPreview
            key={item.id}
            item={item}
            className="library-gallery__category-preview"
          />
        ))}
      </div>
      <div className="library-gallery__category-meta">
        <span className="library-gallery__category-name">{category.name}</span>
        <span className="library-gallery__category-count">
          {t("library.galleryItems", { count: category.items.length })}
        </span>
      </div>
    </button>
  );
};

const ItemCard = ({
  item,
  busy,
  disabled,
  onInsert,
}: {
  item: GalleryLibraryItem;
  busy: boolean;
  disabled: boolean;
  onInsert: (item: GalleryLibraryItem) => void;
}) => {
  return (
    <button
      type="button"
      className={clsx("library-gallery__item-card", {
        "is-busy": busy,
      })}
      disabled={disabled}
      onClick={() => onInsert(item)}
      title={`${item.category} / ${item.name}`}
    >
      <div className="library-gallery__item-preview">
        <LibraryPreview item={item} className="library-gallery__item-image" />
      </div>
      <div className="library-gallery__item-meta">
        <span className="library-gallery__item-name">{item.name}</span>
        <span className="library-gallery__item-category">{item.category}</span>
      </div>
      <span className="library-gallery__item-insert">
        {busy ? t("library.galleryInserting") : t("library.galleryInsert")}
      </span>
    </button>
  );
};

const ItemGrid = ({
  items,
  busyItemId,
  onInsert,
}: {
  items: GalleryLibraryItem[];
  busyItemId: string | null;
  onInsert: (item: GalleryLibraryItem) => void;
}) => {
  return (
    <div className="library-gallery__item-grid">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          busy={busyItemId === item.id}
          disabled={busyItemId !== null}
          onInsert={onInsert}
        />
      ))}
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
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [continuousInsert, setContinuousInsert] =
    useState(readContinuousInsert);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>(readRecentItems);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const activeCategory = useMemo(
    () =>
      catalog?.categories.find(
        (category) => category.id === activeCategoryId,
      ) ?? null,
    [catalog, activeCategoryId],
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      if (query) {
        setQuery("");
      } else if (activeCategoryId) {
        setActiveCategoryId(null);
      } else {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeCategoryId, onClose, query]);

  const rememberItem = useCallback((id: string) => {
    setRecentIds((previous) => {
      const next = [id, ...previous.filter((itemId) => itemId !== id)].slice(
        0,
        MAX_RECENT_ITEMS,
      );
      try {
        localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(next));
      } catch {
        // localStorage may be unavailable.
      }
      return next;
    });
  }, []);

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
            openSidebar: null,
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
          window.setTimeout(onClose, 220);
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
      continuousInsert,
      excalidrawAPI,
      onClose,
      rememberItem,
      showToast,
    ],
  );

  const resetToAll = useCallback(() => {
    setQuery("");
    setActiveCategoryId(null);
  }, []);

  const selectCategory = useCallback((id: string) => {
    setQuery("");
    setActiveCategoryId(id);
  }, []);

  const refresh = useCallback(() => {
    clearLibraryCatalogCache();
    void loadCatalog(true);
  }, [loadCatalog]);

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
              onInsert={insertItem}
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

    if (activeCategory) {
      return (
        <section className="library-gallery__section">
          <div className="library-gallery__section-heading">
            <button
              type="button"
              className="library-gallery__back"
              onClick={resetToAll}
            >
              ← {t("library.galleryAll")}
            </button>
            <h3>{activeCategory.name}</h3>
            <span>
              {t("library.galleryItems", {
                count: activeCategory.items.length,
              })}
            </span>
          </div>
          <ItemGrid
            items={activeCategory.items}
            busyItemId={busyItemId}
            onInsert={insertItem}
          />
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
      <>
        {recentItems.length > 0 && (
          <section className="library-gallery__section">
            <div className="library-gallery__section-heading">
              <h3>{t("library.galleryRecent")}</h3>
            </div>
            <ItemGrid
              items={recentItems}
              busyItemId={busyItemId}
              onInsert={insertItem}
            />
          </section>
        )}

        <section className="library-gallery__section">
          <div className="library-gallery__section-heading">
            <h3>{t("library.galleryCategories")}</h3>
            <span>
              {t("library.galleryCategoryCount", {
                count: catalog.categories.length,
              })}
            </span>
          </div>
          <div className="library-gallery__category-grid">
            {catalog.categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onOpen={selectCategory}
              />
            ))}
          </div>
        </section>
      </>
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
            onClick={onClose}
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

        {catalog && (
          <div className="library-gallery__chips">
            <button
              type="button"
              className={clsx("library-gallery__chip", {
                "is-active": !activeCategoryId && !normalizedQuery,
              })}
              onClick={resetToAll}
            >
              {t("library.galleryAll")}
            </button>
            {catalog.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={clsx("library-gallery__chip", {
                  "is-active": activeCategoryId === category.id,
                })}
                onClick={() => selectCategory(category.id)}
              >
                {category.name}
                <span>{category.items.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="library-gallery__body">{renderBody()}</div>

      {toast && <div className="library-gallery__toast">{toast}</div>}
    </div>,
    portalTarget,
  );
};
