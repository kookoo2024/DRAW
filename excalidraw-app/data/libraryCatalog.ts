import { loadLibraryFromBlob } from "@excalidraw/excalidraw/data/blob";
import { distributeLibraryItemsOnSquareGrid } from "@excalidraw/excalidraw/data/library";

import type { LibraryItems } from "@excalidraw/excalidraw/types";

const LIBRARIES_ROOT = "data/libraries";

type DirectoryEntry = {
  name: string;
  isDir: boolean;
  size: number;
};

type DirectoryListing = {
  files?: DirectoryEntry[];
};

export type GalleryLibraryItem = {
  /** Stable id for React keys and recent-items storage. */
  id: string;
  name: string;
  category: string;
  fileUrl: string;
  previewUrl: string | null;
  size: number;
};

export type GalleryLibraryCategory = {
  id: string;
  name: string;
  items: GalleryLibraryItem[];
};

export type GalleryLibraryCatalog = {
  categories: GalleryLibraryCategory[];
  items: GalleryLibraryItem[];
};

const encodePath = (path: string) =>
  path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const directoryUrl = (path: string) => `/api/list?path=${encodePath(path)}`;

const fetchDirectory = async (
  path: string,
  signal?: AbortSignal,
): Promise<DirectoryEntry[]> => {
  const response = await fetch(directoryUrl(path), {
    cache: "no-cache",
    signal,
  });

  if (!response.ok) {
    throw new Error(`${path} list returned ${response.status}`);
  }

  const data = (await response.json()) as DirectoryListing;
  return Array.isArray(data.files) ? data.files : [];
};

const fetchCategoryOrder = async (signal?: AbortSignal): Promise<string[]> => {
  try {
    const response = await fetch(`/${LIBRARIES_ROOT}/index.json`, {
      cache: "no-cache",
      signal,
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    if (Array.isArray(data.categories)) {
      return data.categories.filter(
        (category: unknown): category is string => typeof category === "string",
      );
    }
    if (Array.isArray(data.order)) {
      return data.order.filter(
        (category: unknown): category is string => typeof category === "string",
      );
    }
  } catch {
    // index.json is optional.
  }
  return [];
};

const compareNames = (left: string, right: string) =>
  left.localeCompare(right, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });

const sortByConfiguredOrder = (
  categories: GalleryLibraryCategory[],
  configuredOrder: string[],
) => {
  if (!configuredOrder.length) {
    return categories.sort((a, b) => compareNames(a.name, b.name));
  }

  const rank = new Map(
    configuredOrder.map((name, index) => [name, index] as const),
  );

  return categories.sort((a, b) => {
    const rankA = rank.get(a.name);
    const rankB = rank.get(b.name);
    if (rankA !== undefined && rankB !== undefined) {
      return rankA - rankB;
    }
    if (rankA !== undefined) {
      return -1;
    }
    if (rankB !== undefined) {
      return 1;
    }
    return compareNames(a.name, b.name);
  });
};

const buildCategory = (
  entry: DirectoryEntry,
  files: DirectoryEntry[],
): GalleryLibraryCategory => {
  const svgSizes = new Map(
    files
      .filter((file) => !file.isDir && /\.svg$/i.test(file.name))
      .map((file) => [file.name, file.size] as const),
  );

  const items = files
    .filter((file) => !file.isDir && /\.excalidrawlib$/i.test(file.name))
    .map((file): GalleryLibraryItem | null => {
      const baseName = file.name.replace(/\.excalidrawlib$/i, "");
      const previewName = `${baseName}.svg`;
      const previewSize = svgSizes.get(previewName);
      const previewUrl =
        previewSize !== undefined
          ? `/${LIBRARIES_ROOT}/${encodeURIComponent(
              entry.name,
            )}/${encodeURIComponent(previewName)}?v=${previewSize}`
          : null;

      // Old bulk libraries (hundreds of items, no matching preview) are kept
      // in the regular sidebar tabs and skipped here.
      if (!previewUrl && file.size > 100_000) {
        return null;
      }

      return {
        id: `${entry.name}/${baseName}`,
        name: baseName,
        category: entry.name,
        fileUrl: `/${LIBRARIES_ROOT}/${encodeURIComponent(
          entry.name,
        )}/${encodeURIComponent(file.name)}`,
        previewUrl,
        size: file.size,
      };
    })
    .filter((item): item is GalleryLibraryItem => item !== null)
    .sort((a, b) => compareNames(a.name, b.name));

  return {
    id: entry.name,
    name: entry.name,
    items,
  };
};

let catalogCache: GalleryLibraryCatalog | null = null;
let catalogPromise: Promise<GalleryLibraryCatalog> | null = null;

export const loadLibraryCatalog = async (
  signal?: AbortSignal,
  force = false,
): Promise<GalleryLibraryCatalog> => {
  if (!force && catalogCache) {
    return catalogCache;
  }
  if (!force && catalogPromise) {
    return catalogPromise;
  }

  catalogPromise = (async () => {
    const rootEntries = await fetchDirectory(LIBRARIES_ROOT, signal);
    const directories = rootEntries.filter(
      (entry) => entry.isDir && !entry.name.startsWith("."),
    );
    const configuredOrder = await fetchCategoryOrder(signal);

    const categories = await Promise.all(
      directories.map(async (entry) => {
        const files = await fetchDirectory(
          `${LIBRARIES_ROOT}/${entry.name}`,
          signal,
        );
        return buildCategory(entry, files);
      }),
    );

    const populatedCategories = sortByConfiguredOrder(
      categories.filter((category) => category.items.length > 0),
      configuredOrder,
    );
    const catalog: GalleryLibraryCatalog = {
      categories: populatedCategories,
      items: populatedCategories.flatMap((category) => category.items),
    };
    catalogCache = catalog;
    return catalog;
  })();

  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
};

export const clearLibraryCatalogCache = () => {
  catalogCache = null;
  catalogPromise = null;
};

export const fetchGalleryLibraryItems = async (
  item: GalleryLibraryItem,
): Promise<LibraryItems> => {
  const response = await fetch(item.fileUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${item.fileUrl} returned ${response.status}`);
  }
  const blob = await response.blob();
  return (await loadLibraryFromBlob(blob, "published")) as LibraryItems;
};

export const getLibraryItemElements = (items: LibraryItems) => {
  if (items.length === 1) {
    return items[0].elements;
  }
  return distributeLibraryItemsOnSquareGrid(items);
};
