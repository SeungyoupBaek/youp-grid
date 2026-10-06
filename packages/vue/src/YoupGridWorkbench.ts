import { defineComponent, h, onMounted, onUnmounted, ref, watchEffect, type PropType } from "vue";
import { createGridWorkbench, type GridWorkbenchOptions } from "@youp-grid/vanilla";

/** Pass controlled options as one object so callbacks have the same contract in both adapters. */
export const YoupGridWorkbench = defineComponent({
  name: "YoupGridWorkbench",
  props: { options: { type: Object as PropType<GridWorkbenchOptions<any>>, required: true } },
  setup(props) {
    const host = ref<HTMLElement>();
    let controls: ReturnType<typeof createGridWorkbench> | undefined;
    let stop: (() => void) | undefined;
    onMounted(() => {
      controls = createGridWorkbench(host.value!, props.options);
      stop = watchEffect(() => controls!.update(props.options));
    });
    onUnmounted(() => { stop?.(); controls?.destroy(); });
    return () => h("div", { ref: host });
  },
});
