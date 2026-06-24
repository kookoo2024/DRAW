import { loadLibraryFromBlob } from "@excalidraw/excalidraw/data/blob";
import type {
  LibraryPersistenceAdapter,
  LibraryPersistedData,
} from "@excalidraw/excalidraw/data/library";
import type {
  LibraryItems_anyVersion,
} from "@excalidraw/excalidraw/types";

/**
 * Absolute path (from the host root) of the shared, read-only library file.
 *
 * The Excalidraw app is deployed under a sub-path (e.g. `/draw/`), but the
 * shared library lives at the host root so the same file can be reused across
 * deployments. Using an absolute path bypasses the app's `base` prefix.
 *
 * To update the shared library, replace this file on the host
 * (e.g. `D:\Fire\library.excalidrawlib`) — no rebuild needed, clients just
 * refresh.
 */
const SHARED_LIBRARY_URL = "/library.excalidrawlib";

/**
 * Read-only adapter that loads a shared `.excalidrawlib` from the host root.
 * All clients see the same library; writes are no-ops so the shared file is
 * never polluted by individual browsers.
 *
 * The `save` implementation is intentionally empty: per-user edits in the
 * library panel still work in-memory for the current session, but are not
 * persisted (the next load re-fetches the shared file).
 */
/**
 * Fetches & parses the shared `.excalidrawlib` from the host root.
 * Returns `null` on any failure (network error, non-OK status, parse error).
 *
 * Shared between the adapter's `load` (initial load on startup, via
 * `useHandleLibrary`) and `reloadSharedLibrary` (manual reload triggered
 * from the library panel's "Reload shared library" button).
 */
export const fetchSharedLibraryItems = async (): Promise<LibraryItems_anyVersion | null> => {
  try {
    const response = await fetch(SHARED_LIBRARY_URL, { cache: "no-cache" });
    if (!response.ok) {
      console.warn(
        `[SharedLibraryAdapter] ${SHARED_LIBRARY_URL} returned ${response.status}, starting with empty library`,
      );
      return null;
    }
    const blob = await response.blob();
    return await loadLibraryFromBlob(blob, "published");
  } catch (error: any) {
    console.error(
      `[SharedLibraryAdapter] failed to load ${SHARED_LIBRARY_URL}: ${error?.message}`,
    );
    return null;
  }
};

export const SharedLibraryAdapter: LibraryPersistenceAdapter = {
  async load() {
    const libraryItems = await fetchSharedLibraryItems();
    return libraryItems ? { libraryItems } : null;
  },
  async save(_data: LibraryPersistedData) {
    // no-op: shared library is read-only
  },
};
