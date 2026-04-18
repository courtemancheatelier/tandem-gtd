"use client";

import { useState, useCallback, useMemo, useEffect } from "react";

interface UseSelectionOptions {
  items: { id: string }[];
}

export function useSelection({ items }: UseSelectionOptions) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-prune stale IDs when items change
  const itemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  useEffect(() => {
    setSelectedIds((prev) => {
      const pruned = new Set<string>(
        Array.from(prev).filter((id) => itemIds.has(id))
      );
      if (pruned.size !== prev.size) return pruned;
      return prev;
    });
  }, [itemIds]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectionCount = selectedIds.size;
  const isSelectionMode = selectionCount > 0;

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    selectionCount,
    isSelectionMode,
  };
}
