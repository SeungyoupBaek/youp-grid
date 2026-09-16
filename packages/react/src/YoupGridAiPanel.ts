import {
  applyGridAiResponse,
  createGridAiRequest,
  type ColumnDef,
  type GridAiProvider,
  type GridState,
} from "@youp-grid/core";
import { createElement, useEffect, useRef, useState, type FormEvent } from "react";

const DEFAULT_TEXT = {
  label: "AI grid instruction",
  placeholder: "Show only Open trades and sort Quantity highest first",
  submit: "Apply",
  cancel: "Cancel",
  loading: "Working…",
  applied: "Grid updated.",
  failed: "Unable to apply the instruction. Try again.",
  stale: "The grid changed while waiting. Submit your instruction again.",
};

export type YoupGridAiPanelProps<TRow> = {
  columns: readonly ColumnDef<TRow>[];
  state: GridState;
  provider: GridAiProvider;
  onStateChange: (state: GridState) => void;
  disabled?: boolean;
  localeText?: Partial<typeof DEFAULT_TEXT>;
};

/** Controlled companion panel; all model traffic belongs to the application's provider. */
export function YoupGridAiPanel<TRow>(props: YoupGridAiPanelProps<TRow>) {
  const text = { ...DEFAULT_TEXT, ...props.localeText };
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const active = useRef<AbortController>();
  const latest = useRef(props);
  latest.current = props;

  const cancel = () => {
    active.current?.abort();
    active.current = undefined;
    setPending(false);
    setMessage("");
  };
  useEffect(() => () => {
    active.current?.abort();
    active.current = undefined;
  }, []);
  useEffect(() => { if (props.disabled) cancel(); }, [props.disabled]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (active.current || props.disabled || !prompt.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setMessage("");
    setError(false);
    try {
      const request = createGridAiRequest({ prompt, columns: props.columns, state: props.state });
      const context = JSON.stringify(request.context);
      const response = await props.provider(request, { signal: controller.signal });
      if (controller.signal.aborted || active.current !== controller) return;
      const current = latest.current;
      if (current.disabled) return;
      const currentRequest = createGridAiRequest({ prompt, columns: current.columns, state: current.state });
      if (current.provider !== props.provider || JSON.stringify(currentRequest.context) !== context) {
        throw new Error(text.stale);
      }
      const result = applyGridAiResponse({ response, columns: current.columns, state: current.state });
      if (result.response.actions.length > 0) current.onStateChange(result.state);
      setMessage(result.response.explanation || (result.response.actions.length > 0 ? text.applied : ""));
    } catch (cause) {
      if (controller.signal.aborted || active.current !== controller) return;
      setError(true);
      setMessage(cause instanceof Error ? cause.message : text.failed);
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        setPending(false);
      }
    }
  };

  return createElement("form", {
    className: "youp-grid-ai", "aria-label": text.label, "aria-busy": pending,
    onSubmit: (event) => { void submit(event); },
  },
  createElement("div", { className: "youp-grid-ai__controls" },
    createElement("input", {
      type: "text", value: prompt, "aria-label": text.label, placeholder: text.placeholder,
      disabled: props.disabled || pending,
      onChange: (event) => setPrompt(event.currentTarget.value),
    }),
    pending
      ? createElement("button", { type: "button", onClick: cancel }, text.cancel)
      : createElement("button", { type: "submit", disabled: props.disabled || !prompt.trim() }, text.submit),
  ),
  pending || message ? createElement("p", { role: error ? "alert" : "status" }, pending ? text.loading : message) : null,
  );
}
