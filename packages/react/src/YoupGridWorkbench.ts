import { createElement, useEffect, useRef } from "react";
import { createGridWorkbench, type GridWorkbenchOptions } from "@youp-grid/vanilla";

export type YoupGridWorkbenchProps<TRow> = GridWorkbenchOptions<TRow>;

export function YoupGridWorkbench<TRow>(props: YoupGridWorkbenchProps<TRow>) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof createGridWorkbench<TRow>>>();
  useEffect(() => {
    controls.current = createGridWorkbench(host.current!, props);
    return () => { controls.current?.destroy(); controls.current = undefined; };
  }, []);
  useEffect(() => { controls.current?.update(props); });
  return createElement("div", { ref: host });
}
