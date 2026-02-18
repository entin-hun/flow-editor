<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import type { AbstractNode, NodeInterface } from "@baklavajs/core";
import { Components } from "@baklavajs/renderer-vue";

type Location = "left" | "right" | "top" | "bottom";

type PortMeta = {
  location?: Location;
};

const props = defineProps<{
  node: AbstractNode;
  onAddInput?: () => void;
  onAddOutput?: () => void;
  onAddMechanism?: () => void;
  onDelete?: () => void;
}>();

const titleDraft = ref("");
const readTitle = () => (props.node as AbstractNode & { title?: string }).title ?? "";
const syncTitle = () => {
  (props.node as AbstractNode & { title?: string }).title = titleDraft.value.trim();
};

watch(
  () => readTitle(),
  (next) => {
    titleDraft.value = next;
  },
  { immediate: true }
);

const detailsDraft = ref("");
const readDetails = () => (props.node as AbstractNode & { details?: string }).details ?? "";
const syncDetails = () => {
  (props.node as AbstractNode & { details?: string }).details = detailsDraft.value;
};

watch(
  () => readDetails(),
  (next) => {
    detailsDraft.value = next;
  },
  { immediate: true }
);

const readLocation = (intf: NodeInterface<unknown>) =>
  (intf as NodeInterface<unknown> & { data?: PortMeta }).data?.location;

/** Detect portrait / vertical screen orientation */
const isVertical = ref(false);
const updateOrientation = () => {
  isVertical.value = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
};
onMounted(() => {
  updateOrientation();
  window.addEventListener("resize", updateOrientation);
});
onUnmounted(() => {
  window.removeEventListener("resize", updateOrientation);
});

/**
 * In portrait mode, remap process-node port sides:
 *   left (inputs)     → top
 *   right (outputs)   → bottom
 *   bottom (mechanisms) → right
 *   top (controls)    → right
 */
const remapSide = (side: Location): Location => {
  if (!isVertical.value) return side;
  const map: Record<Location, Location> = { left: "top", right: "bottom", bottom: "right", top: "right" };
  return map[side] ?? side;
};

const inputPorts = computed(() => Object.values(props.node.inputs).filter((intf) => readLocation(intf) === "left"));
const outputPorts = computed(() => Object.values(props.node.outputs).filter((intf) => readLocation(intf) === "right"));
const mechanismPorts = computed(() => Object.values(props.node.inputs).filter((intf) => readLocation(intf) === "bottom"));

const getPortStyle = (side: Location): CSSProperties => {
  if (side === "left") {
    return {
      position: "absolute" as const,
      left: "0%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  if (side === "right") {
    return {
      position: "absolute" as const,
      left: "100%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  if (side === "top") {
    return {
      position: "absolute" as const,
      left: "50%",
      top: "0%",
      transform: "translate(-50%, -50%)",
    };
  }

  return {
    position: "absolute" as const,
    left: "50%",
    top: "100%",
    transform: "translate(-50%, -50%)",
  };
};

const getAddButtonStyle = (side: Location) => {
  const base = getPortStyle(side);
  if (side === "left") {
    return { ...base, left: "-12px" };
  }
  if (side === "right") {
    return { ...base, left: "calc(100% + 12px)" };
  }
  if (side === "top") {
    return { ...base, top: "-12px" };
  }
  return { ...base, top: "calc(100% + 12px)" };
};

const NodeInterfaceView = Components.NodeInterface;
</script>

<template>
  <div class="idef0-node">
    <NodeInterfaceView
      v-for="intf in inputPorts"
      :key="intf.id"
      :node="node"
      :intf="intf"
      :style="getPortStyle(remapSide('left'))"
    />
    <button
      class="add-port-btn"
      type="button"
      title="Add input"
      :style="getAddButtonStyle(remapSide('left'))"
      @click.stop="props.onAddInput?.()"
    >
      +
    </button>

    <NodeInterfaceView
      v-for="intf in outputPorts"
      :key="intf.id"
      :node="node"
      :intf="intf"
      :style="getPortStyle(remapSide('right'))"
    />
    <button
      class="add-port-btn"
      type="button"
      title="Add output"
      :style="getAddButtonStyle(remapSide('right'))"
      @click.stop="props.onAddOutput?.()"
    >
      +
    </button>

    <div class="node-content">
      <div class="title-row">
        <input
          v-model="titleDraft"
          class="title-input"
          type="text"
          @input="syncTitle"
          @blur="syncTitle"
        />
        <button class="delete-btn" type="button" title="Delete" @click.stop="props.onDelete?.()">
          ×
        </button>
      </div>
      <div class="details-row">
        <textarea
          v-model="detailsDraft"
          class="details-input"
          placeholder="details"
          @blur="syncDetails"
        />
      </div>
    </div>

    <NodeInterfaceView
      v-for="intf in mechanismPorts"
      :key="intf.id"
      :node="node"
      :intf="intf"
      :style="getPortStyle(remapSide('bottom'))"
    />
    <button
      class="add-port-btn"
      type="button"
      title="Add mechanism"
      :style="getAddButtonStyle(remapSide('bottom'))"
      @click.stop="props.onAddMechanism?.()"
    >
      +
    </button>

  </div>
</template>

<style scoped>
.idef0-node {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 200px;
  max-width: 200px;
  padding: 10px;
  background: hsl(var(--card));
  border: 1.5px solid hsl(var(--primary));
  border-radius: var(--radius);
  position: relative;
  box-shadow: var(--shadow-md);
}

.idef0-node.selected {
  border-color: hsl(var(--accent));
  box-shadow: 0 0 0 3px hsl(var(--accent) / 0.2), var(--shadow-md);
}

.port-area {
  display: flex;
  gap: 6px;
  padding: 6px;
  min-height: 28px;
}

.port-area.top {
  grid-area: top;
  justify-content: center;
  flex-wrap: wrap;
  border-bottom: 1px solid hsl(var(--border));
}

.port-area.bottom {
  grid-area: bottom;
  justify-content: center;
  flex-wrap: wrap;
  border-top: 1px solid hsl(var(--border));
}

.idef0-node :deep(.baklava-node-interface) {
  width: 12px;
  height: 12px;
  padding: 0;
  margin: 0;
  line-height: 0;
  font-size: 0;
}

.idef0-node :deep(.baklava-node-interface > span) {
  display: none;
}

.add-port-btn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid hsl(var(--primary));
  background: hsl(var(--primary));
  color: hsl(var(--primary-fg));
  font-size: 12px;
  font-weight: 700;
  line-height: 14px;
  padding: 0;
  cursor: pointer;
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 3px hsl(var(--primary) / 0.3); }
  50% { box-shadow: 0 0 10px hsl(var(--primary) / 0.8), 0 0 20px hsl(var(--primary) / 0.3); }
}

@media (max-width: 768px) {
  .add-port-btn {
    width: 20px;
    height: 20px;
    font-size: 14px;
    line-height: 18px;
  }

  .title-input {
    font-size: 13px;
    padding: 6px 8px;
  }

  .details-input {
    min-height: 140px;
    font-size: 12px;
  }
}

.port-area.left,
.port-area.right {
  flex-direction: column;
  justify-content: center;
}

.port-area.left {
  grid-area: left;
  border-right: 1px solid hsl(var(--border));
}

.port-area.right {
  grid-area: right;
  border-left: 1px solid hsl(var(--border));
}

.node-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 14px;
  user-select: none;
  padding: 4px;
  cursor: move;
  width: 100%;
  min-height: 160px;
}

.node-content:active {
  cursor: grabbing;
}

.port-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1.2;
}

.port-wrapper.horizontal {
  flex-direction: row;
}

.label {
  color: hsl(var(--muted-fg));
  white-space: nowrap;
}

.title-row {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.title-input {
  width: 100%;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border-radius: calc(var(--radius) - 2px);
  font-size: 14px;
  font-weight: 700;
  font-family: 'Space Grotesk', sans-serif;
  padding: 4px 6px;
  text-align: center;
  transition: border-color 0.15s;
}

.title-input:focus {
  outline: none;
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15);
}

.delete-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  aspect-ratio: 1;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  transition: background 0.15s, border-color 0.15s;
}

.delete-btn:hover {
  background: hsl(var(--destructive) / 0.1);
  border-color: hsl(var(--destructive));
  color: hsl(var(--destructive));
}

.details-row {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  flex: 1;
}

.details-input {
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
  font-size: 11px;
  padding: 6px 8px;
  border-radius: calc(var(--radius) - 2px);
  width: 100%;
  min-height: 120px;
  flex: 1;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
}

.details-input:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12);
}

:deep(.__port) {
  transform: scale(0.95);
}
</style>
