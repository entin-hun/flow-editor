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
  background: #2a2a2a;
  border: 2px solid #4fc3f7;
  border-radius: 6px;
  position: relative;
}

.idef0-node.selected {
  border-color: #111;
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
  border-bottom: 1px solid #000;
}

.port-area.bottom {
  grid-area: bottom;
  justify-content: center;
  flex-wrap: wrap;
  border-top: 1px solid #000;
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
  border: 1px solid #4fc3f7;
  background: #4fc3f7;
  color: #101418;
  font-size: 12px;
  font-weight: 700;
  line-height: 14px;
  padding: 0;
  cursor: pointer;
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 3px rgba(79, 195, 247, 0.4); }
  50% { box-shadow: 0 0 10px rgba(79, 195, 247, 0.9), 0 0 20px rgba(79, 195, 247, 0.4); }
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
  border-right: 1px solid #000;
}

.port-area.right {
  grid-area: right;
  border-left: 1px solid #000;
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
  color: #111;
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
  border: 1px solid #4fc3f7;
  background: #101418;
  color: #fff;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 700;
  padding: 4px 6px;
  text-align: center;
}

.delete-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  aspect-ratio: 1;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid #4fc3f7;
  background: #101418;
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
}

.delete-btn:hover {
  background: #1b2a33;
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
  background: #101418;
  border: 1px solid #4fc3f7;
  color: #fff;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 4px;
  width: 100%;
  min-height: 120px;
  flex: 1;
  outline: none;
  resize: vertical;
}

:deep(.__port) {
  transform: scale(0.95);
}
</style>
