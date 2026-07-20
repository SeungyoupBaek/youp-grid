import type { FilterRule, GridState, PivotModel, PivotState, SortRule } from "./types.ts";

export type ServerRowsQuery = {
  startRow: number;
  endRow: number;
  sort?: readonly SortRule[];
  filters?: readonly FilterRule[];
  groupBy?: readonly string[];
  pivot?: PivotState;
  cursor?: string;
};

export type ServerRowsResult<TRow> = {
  rows: readonly TRow[];
  rowCount?: number;
  filteredRowCount?: number;
  nextCursor?: string;
  previousCursor?: string;
  pivot?: PivotModel;
};

export type ServerDataSource<TRow> = {
  getRows: (query: ServerRowsQuery, signal: AbortSignal) => Promise<ServerRowsResult<TRow>>;
};

export type ServerBlockCacheOptions = {
  blockSize?: number;
  maxBlocks?: number;
};

export type ServerBlockCache<TRow> = {
  blockSize: number;
  maxBlocks: number;
  get: (key: string, blockIndex: number) => ServerRowsResult<TRow> | undefined;
  set: (key: string, blockIndex: number, result: ServerRowsResult<TRow>) => void;
  invalidate: (key?: string) => void;
  size: () => number;
};

export type ServerBlockStatus = "idle" | "loading" | "success" | "error";

export type ServerBlockState = {
  status: ServerBlockStatus;
  error?: string;
};

export type ServerDataController<TRow> = {
  cache: ServerBlockCache<TRow>;
  load: (key: string, blockIndex: number, state: GridState, force?: boolean) => Promise<ServerRowsResult<TRow>>;
  retry: (key: string, blockIndex: number) => Promise<ServerRowsResult<TRow>>;
  getStatus: (key: string, blockIndex: number) => ServerBlockState;
  abort: (key?: string, blockIndex?: number) => void;
  invalidate: (key?: string) => void;
};

const DEFAULT_BLOCK_SIZE = 100;
const DEFAULT_MAX_BLOCKS = 20;

export function createServerRowsQuery(
  state: GridState,
  startRow: number,
  blockSize = DEFAULT_BLOCK_SIZE,
): ServerRowsQuery {
  const normalizedStart = Math.max(0, Math.floor(startRow));
  const normalizedBlockSize = Math.max(1, Math.floor(blockSize));

  return {
    startRow: normalizedStart,
    endRow: normalizedStart + normalizedBlockSize,
    sort: state.sort,
    filters: state.filters,
    groupBy: state.rowGrouping?.columnIds,
    ...(state.pivot ? { pivot: state.pivot } : {}),
    cursor: state.cursorPagination?.cursor,
  };
}

export function createServerBlockCache<TRow>(
  options: ServerBlockCacheOptions = {},
): ServerBlockCache<TRow> {
  const blockSize = Math.max(1, Math.floor(options.blockSize ?? DEFAULT_BLOCK_SIZE));
  const maxBlocks = Math.max(1, Math.floor(options.maxBlocks ?? DEFAULT_MAX_BLOCKS));
  const entries = new Map<string, { key: string; result: ServerRowsResult<TRow> }>();
  const cacheKey = (key: string, blockIndex: number) => JSON.stringify([
    key,
    Math.max(0, Math.floor(blockIndex)),
  ]);

  return {
    blockSize,
    maxBlocks,
    get(key, blockIndex) {
      const entryKey = cacheKey(key, blockIndex);
      const entry = entries.get(entryKey);

      if (entry) {
        entries.delete(entryKey);
        entries.set(entryKey, entry);
      }

      return entry?.result;
    },
    set(key, blockIndex, result) {
      const entryKey = cacheKey(key, blockIndex);
      entries.delete(entryKey);
      entries.set(entryKey, { key, result });

      while (entries.size > maxBlocks) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (oldestKey === undefined) {
          break;
        }
        entries.delete(oldestKey);
      }
    },
    invalidate(key) {
      if (key === undefined) {
        entries.clear();
        return;
      }

      for (const [entryKey, entry] of entries) {
        if (entry.key === key) {
          entries.delete(entryKey);
        }
      }
    },
    size: () => entries.size,
  };
}

export function createServerDataController<TRow>(
  dataSource: ServerDataSource<TRow>,
  options: ServerBlockCacheOptions = {},
): ServerDataController<TRow> {
  const cache = createServerBlockCache<TRow>(options);
  const statuses = new Map<string, ServerBlockState>();
  const requests = new Map<string, Promise<ServerRowsResult<TRow>>>();
  const controllers = new Map<string, AbortController>();
  const lastStates = new Map<string, GridState>();
  const scopes = new Map<string, { key: string; blockIndex: number }>();
  const requestKey = (key: string, blockIndex: number) => JSON.stringify([
    key,
    Math.max(0, Math.floor(blockIndex)),
  ]);

  const load = async (key: string, blockIndex: number, state: GridState, force = false) => {
    const normalizedBlockIndex = Math.max(0, Math.floor(blockIndex));
    const entryKey = requestKey(key, normalizedBlockIndex);
    const cached = force ? undefined : cache.get(key, normalizedBlockIndex);
    scopes.set(entryKey, { key, blockIndex: normalizedBlockIndex });

    if (cached) {
      statuses.set(entryKey, { status: "success" });
      return cached;
    }

    const activeRequest = requests.get(entryKey);
    if (activeRequest && !force) {
      return activeRequest;
    }

    controllers.get(entryKey)?.abort();
    const controller = new AbortController();
    const query = createServerRowsQuery(state, normalizedBlockIndex * cache.blockSize, cache.blockSize);
    lastStates.set(entryKey, state);
    controllers.set(entryKey, controller);
    statuses.set(entryKey, { status: "loading" });

    const request = dataSource.getRows(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          cache.set(key, normalizedBlockIndex, result);
          statuses.set(entryKey, { status: "success" });
        }
        return result;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          statuses.set(entryKey, {
            status: "error",
            error: error instanceof Error ? error.message : "Unable to load rows",
          });
        }
        throw error;
      })
      .finally(() => {
        if (controllers.get(entryKey) === controller) {
          controllers.delete(entryKey);
          requests.delete(entryKey);
        }
      });

    requests.set(entryKey, request);
    return request;
  };

  return {
    cache,
    load,
    retry(key, blockIndex) {
      const entryKey = requestKey(key, blockIndex);
      const state = lastStates.get(entryKey);
      if (!state) {
        return Promise.reject(new Error("No previous server block request to retry."));
      }
      return load(key, blockIndex, state, true);
    },
    getStatus(key, blockIndex) {
      return statuses.get(requestKey(key, blockIndex)) ?? { status: "idle" };
    },
    abort(key, blockIndex) {
      for (const [entryKey, controller] of controllers) {
        const scope = scopes.get(entryKey);
        const matchesKey = key === undefined || scope?.key === key;
        const matchesBlock = blockIndex === undefined || scope?.blockIndex === Math.max(0, Math.floor(blockIndex));
        if (matchesKey && matchesBlock) {
          controller.abort();
          controllers.delete(entryKey);
          requests.delete(entryKey);
          statuses.set(entryKey, { status: "idle" });
        }
      }
    },
    invalidate(key) {
      cache.invalidate(key);
      for (const [entryKey, scope] of scopes) {
        if (key === undefined || scope.key === key) {
          statuses.delete(entryKey);
          lastStates.delete(entryKey);
          scopes.delete(entryKey);
        }
      }
    },
  };
}
