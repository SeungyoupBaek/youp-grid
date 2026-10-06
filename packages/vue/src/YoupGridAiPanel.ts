import { defineComponent, h, onUnmounted, ref, shallowRef, watch, type PropType } from "vue";
import { applyGridAiPreview, createGridAiPreview, createGridAiRequest, undoGridAiPreview,
  type ColumnDef, type GridAiPreview, type GridAiProvider, type GridState } from "@youp-grid/core";

const defaultText = { label: "AI grid instruction", placeholder: "Describe a filter, sort or column change", submit: "Apply", preview: "Preview", confirm: "Apply AI changes", discard: "Discard AI preview", undo: "Undo AI changes", cancel: "Cancel", loading: "Working…", applied: "Grid updated." };
export const YoupGridAiPanel = defineComponent({
  name: "YoupGridAiPanel",
  props: {
    columns: { type: Array as PropType<readonly ColumnDef<any>[]>, required: true },
    state: { type: Object as PropType<GridState>, required: true },
    provider: { type: Function as PropType<GridAiProvider>, required: true },
    onStateChange: { type: Function as PropType<(state: GridState) => void>, required: true },
    disabled: Boolean, preview: Boolean,
    localeText: { type: Object as PropType<Partial<typeof defaultText>>, default: undefined },
  },
  setup(props) {
    const prompt = ref(""); const pending = ref(false); const message = ref(""); const error = ref(false);
    const preview = shallowRef<GridAiPreview>(); const applied = shallowRef<GridAiPreview>();
    let active: AbortController | undefined;
    const cancel = () => { active?.abort(); active = undefined; pending.value = false; preview.value = undefined; message.value = ""; };
    onUnmounted(cancel); watch(() => props.disabled, (disabled) => { if (disabled) cancel(); });
    const attempt = (action: () => void) => { try { action(); error.value = false; } catch (cause) { error.value = true; message.value = cause instanceof Error ? cause.message : String(cause); } };
    const submit = async () => {
      if (active || props.disabled || !prompt.value.trim()) return;
      const controller = new AbortController(); active = controller; pending.value = true; preview.value = undefined; message.value = ""; error.value = false;
      try {
        const provider = props.provider;
        const request = createGridAiRequest({ prompt: prompt.value, columns: props.columns, state: props.state });
        const response = await provider(request, { signal: controller.signal });
        if (controller.signal.aborted || active !== controller || props.disabled) return;
        const current = createGridAiRequest({ prompt: request.prompt, columns: props.columns, state: props.state });
        if (provider !== props.provider || JSON.stringify(request.context) !== JSON.stringify(current.context)) throw new Error("The grid changed while waiting. Submit your instruction again.");
        const result = createGridAiPreview(response, props.columns, props.state);
        if (props.preview && result.response.actions.length) preview.value = result;
        else if (result.response.actions.length) { const next = applyGridAiPreview(result, props.columns, props.state); props.onStateChange(next); applied.value = { ...result, after: next }; }
        message.value = result.response.explanation;
      } catch (cause) { if (active === controller && !controller.signal.aborted) attempt(() => { throw cause; }); }
      finally { if (active === controller) { active = undefined; pending.value = false; } }
    };
    return () => {
      const text = { ...defaultText, ...props.localeText };
      return h("form", { class: "youp-grid-ai", "aria-label": text.label, "aria-busy": pending.value, onSubmit: (event: Event) => { event.preventDefault(); void submit(); } }, [
        h("div", { class: "youp-grid-ai__controls" }, [
          h("input", { value: prompt.value, "aria-label": text.label, placeholder: text.placeholder, disabled: props.disabled || pending.value, onInput: (event: Event) => { prompt.value = (event.target as HTMLInputElement).value; } }),
          pending.value ? h("button", { type: "button", onClick: cancel }, text.cancel) : h("button", { type: "submit", disabled: props.disabled || !prompt.value.trim() }, props.preview ? text.preview : text.submit),
        ]),
        preview.value ? h("div", { class: "youp-grid-ai__preview", "aria-label": "AI preview" }, [
          h("pre", JSON.stringify({ before: createGridAiRequest({ prompt: "preview", columns: props.columns, state: preview.value.before }).context.state, actions: preview.value.response.actions, after: createGridAiRequest({ prompt: "preview", columns: props.columns, state: preview.value.after }).context.state }, null, 2)),
          h("button", { type: "button", disabled: props.disabled || pending.value, onClick: () => attempt(() => { const result = preview.value!; const next = applyGridAiPreview(result, props.columns, props.state); props.onStateChange(next); applied.value = { ...result, after: next }; preview.value = undefined; message.value = text.applied; }) }, text.confirm),
          h("button", { type: "button", onClick: () => { preview.value = undefined; } }, text.discard),
        ]) : undefined,
        applied.value ? h("button", { type: "button", disabled: props.disabled || pending.value, onClick: () => attempt(() => { props.onStateChange(undoGridAiPreview(applied.value!, props.columns, props.state)); applied.value = undefined; message.value = ""; }) }, text.undo) : undefined,
        pending.value || message.value ? h("p", { role: error.value ? "alert" : "status" }, pending.value ? text.loading : message.value) : undefined,
      ]);
    };
  },
});
