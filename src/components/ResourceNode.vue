<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Components } from "@baklavajs/renderer-vue";
import type { AbstractNode, NodeInterface } from "@baklavajs/core";

type Location = "left" | "right" | "top" | "bottom";
type PortMeta = {
  location?: Location;
};

const props = defineProps<{
  node: AbstractNode;
  onDelete?: () => void;
  onOutputConnector?: (intf: NodeInterface<unknown>) => void;
  onInputConnector?: (intf: NodeInterface<unknown>) => void;
}>();

type ResourceFields = {
  origin?: string;
  inputQuantity?: number;
  details?: string;
  outputKg?: number;
  destination?: string;
  quantity?: number;
  duration?: string;
  parameters?: string;
  lcaAutocompleteMainProduct?: boolean;
};

type ProductionOption = {
  uuid: string;
  production_name?: string;
  activity_name?: string;
  location?: string;
  unit?: string;
  similarity?: number;
};

const readFields = () => (props.node as AbstractNode & { fields?: ResourceFields }).fields ?? {};
const readResourceType = () => (props.node as AbstractNode & { resourceType?: string }).resourceType ?? "";
const readTitle = () => (props.node as AbstractNode & { title?: string }).title ?? "";

const titleDraft = ref(readTitle());
const syncTitle = () => {
  (props.node as AbstractNode & { title?: string }).title = titleDraft.value.trim();
};

const isMainProductAutocompleteNode = computed(() => {
  return Boolean(readFields().lcaAutocompleteMainProduct) && readResourceType() === "output";
});

const autocompleteOptions = ref<ProductionOption[]>([]);
const autocompleteLoading = ref(false);
const autocompleteOpen = ref(false);
let autocompleteTimer: ReturnType<typeof setTimeout> | undefined;
let autocompleteAbort: AbortController | undefined;

const AUTOCOMPLETE_URL = "https://lca.trace.market/api/v1/production-options/autocomplete";
const PRODUCTION_TREE_URL = "https://lca.trace.market/api/v1/production-tree/{uuid}?service=ecoinvent_3_12_cutoff_fixed";

const clearAutocomplete = () => {
  autocompleteOptions.value = [];
  autocompleteOpen.value = false;
};

const fetchAutocomplete = async (query: string) => {
  if (!isMainProductAutocompleteNode.value) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    clearAutocomplete();
    return;
  }

  try {
    autocompleteAbort?.abort();
    const controller = new AbortController();
    autocompleteAbort = controller;
    autocompleteLoading.value = true;

    const response = await fetch(`${AUTOCOMPLETE_URL}?q=${encodeURIComponent(trimmed)}&limit=10`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Autocomplete request failed: ${response.status}`);
    }
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? (payload.results as ProductionOption[]) : [];
    autocompleteOptions.value = results;
    autocompleteOpen.value = results.length > 0;
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.error("[LCA] autocomplete failed", error);
      clearAutocomplete();
    }
  } finally {
    autocompleteLoading.value = false;
  }
};

const scheduleAutocomplete = (query: string) => {
  if (autocompleteTimer) {
    clearTimeout(autocompleteTimer);
  }
  autocompleteTimer = setTimeout(() => {
    fetchAutocomplete(query);
  }, 250);
};

const requestProductionTree = async (uuid: string) => {
  try {
    const endpoint = PRODUCTION_TREE_URL.replace("{uuid}", encodeURIComponent(uuid));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 10 }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      console.error("[LCA] production-tree request failed", response.status, payload);
      return;
    }

    console.log("[LCA] production-tree response", payload);
  } catch (error) {
    console.error("[LCA] production-tree request error", error);
  }
};

const selectAutocompleteOption = async (option: ProductionOption) => {
  if (!option?.uuid) return;
  const label = (option.production_name || option.activity_name || "").trim();
  if (label) {
    titleDraft.value = label;
    syncTitle();
  }
  clearAutocomplete();
  await requestProductionTree(option.uuid);
};

const handleTitleInput = () => {
  syncTitle();
  if (!isMainProductAutocompleteNode.value) return;
  scheduleAutocomplete(titleDraft.value);
};

const handleTitleFocus = () => {
  if (!isMainProductAutocompleteNode.value) return;
  if (autocompleteOptions.value.length > 0) {
    autocompleteOpen.value = true;
  }
};

const handleTitleBlur = () => {
  syncTitle();
  window.setTimeout(() => {
    autocompleteOpen.value = false;
  }, 120);
};

watch(
  () => readTitle(),
  (next) => {
    if (next !== titleDraft.value) {
      titleDraft.value = next;
    }
  }
);

const editingOrigin = ref(false);
const originDraft = ref("");
const startEditOrigin = () => {
  originDraft.value = readFields().origin ?? "";
  editingOrigin.value = true;
};
const saveOrigin = () => {
  const fields = readFields();
  fields.origin = originDraft.value.trim();
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
  editingOrigin.value = false;
};

const editingOutputKg = ref(false);
const outputKgDraft = ref("1");
const startEditOutputKg = () => {
  const current = readFields().outputKg;
  outputKgDraft.value = current === undefined || Number.isNaN(current) ? "1" : String(current);
  editingOutputKg.value = true;
};
const saveOutputKg = () => {
  const parsed = Number(outputKgDraft.value);
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const fields = readFields();
  fields.outputKg = safeValue;
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
  outputKgDraft.value = String(safeValue);
  editingOutputKg.value = false;
};

const editingDestination = ref(false);
const destinationDraft = ref("");
const startEditDestination = () => {
  destinationDraft.value = readFields().destination ?? "";
  editingDestination.value = true;
};
const saveDestination = () => {
  const fields = readFields();
  fields.destination = destinationDraft.value.trim();
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
  editingDestination.value = false;
};

const editingInputQuantity = ref(false);
const inputQuantityDraft = ref("0");
const startEditInputQuantity = () => {
  const current = readFields().inputQuantity;
  inputQuantityDraft.value = current === undefined || Number.isNaN(current) ? "0" : String(current);
  editingInputQuantity.value = true;
};
const saveInputQuantity = () => {
  const parsed = Number(inputQuantityDraft.value);
  const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const fields = readFields();
  fields.inputQuantity = safeValue;
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
  inputQuantityDraft.value = String(safeValue);
  editingInputQuantity.value = false;
};

const detailsDraft = ref("");
const syncDetails = () => {
  const fields = readFields();
  fields.details = detailsDraft.value;
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
};

watch(
  () => readFields().details,
  (next) => {
    detailsDraft.value = next ?? "";
  },
  { immediate: true }
);

const editingQuantity = ref(false);
const quantityDraft = ref("0");
const startEditQuantity = () => {
  const current = readFields().quantity;
  quantityDraft.value = current === undefined || Number.isNaN(current) ? "0" : String(current);
  editingQuantity.value = true;
};
const saveQuantity = () => {
  const parsed = Number(quantityDraft.value);
  const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const fields = readFields();
  fields.quantity = safeValue;
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
  quantityDraft.value = String(safeValue);
  editingQuantity.value = false;
};

const editingDuration = ref(false);
const durationDraft = ref("");
const startEditDuration = () => {
  durationDraft.value = readFields().duration ?? "";
  editingDuration.value = true;
};
const saveDuration = () => {
  const fields = readFields();
  fields.duration = durationDraft.value.trim();
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
  editingDuration.value = false;
};

const parametersDraft = ref("");
const syncParameters = () => {
  const fields = readFields();
  fields.parameters = parametersDraft.value;
  (props.node as AbstractNode & { fields?: ResourceFields }).fields = fields;
};

watch(
  () => readFields().parameters,
  (next) => {
    parametersDraft.value = next ?? "";
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

// Track total connections across all ports to conditionally show the delete button
const totalConnectionCount = ref(0);
const connectionToken = Symbol("ResourceNode.connectionCount");

const syncConnectionCount = () => {
  totalConnectionCount.value = [
    ...Object.values(props.node.inputs),
    ...Object.values(props.node.outputs),
  ].reduce((sum, intf) => sum + (intf as NodeInterface).connectionCount, 0);
};

const hasMultipleConnections = computed(() => totalConnectionCount.value > 1);

onMounted(() => {
  updateOrientation();
  window.addEventListener("resize", updateOrientation);

  syncConnectionCount();
  const allIntfs = [...Object.values(props.node.inputs), ...Object.values(props.node.outputs)] as NodeInterface[];
  allIntfs.forEach((intf) => {
    intf.events.setConnectionCount.subscribe(connectionToken, () => syncConnectionCount());
  });
});
onUnmounted(() => {
  window.removeEventListener("resize", updateOrientation);

  if (autocompleteTimer) {
    clearTimeout(autocompleteTimer);
  }
  autocompleteAbort?.abort();

  const allIntfs = [...Object.values(props.node.inputs), ...Object.values(props.node.outputs)] as NodeInterface[];
  allIntfs.forEach((intf) => {
    intf.events.setConnectionCount.unsubscribe(connectionToken);
  });
});

/**
 * In portrait mode, remap resource-node port sides:
 *   right (input outputs)     → bottom  (face process top from above)
 *   left  (output inputs)     → top     (face process bottom from below)
 *   top   (mechanism outputs) → left    (face process right from the right side)
 *   bottom                    → bottom  (no change)
 */
const remapSide = (side: Location): Location => {
  if (!isVertical.value) return side;
  const map: Record<Location, Location> = { right: "bottom", left: "top", top: "left", bottom: "bottom" };
  return map[side] ?? side;
};

const allPorts = computed(() => [...Object.values(props.node.inputs), ...Object.values(props.node.outputs)]);
const leftPorts = computed(() => allPorts.value.filter((intf) => readLocation(intf) === "left"));
const rightPorts = computed(() => allPorts.value.filter((intf) => readLocation(intf) === "right"));
const topPorts = computed(() => allPorts.value.filter((intf) => readLocation(intf) === "top"));
const bottomPorts = computed(() => allPorts.value.filter((intf) => readLocation(intf) === "bottom"));

const resourceType = computed(() => readResourceType());
const isInput = computed(() => resourceType.value === "input");
const isOutput = computed(() => resourceType.value === "output");
const isQuantityNode = computed(() => ["energy", "gas", "water"].includes(resourceType.value));
const isTimedNode = computed(() => ["machine", "service", "property"].includes(resourceType.value));

const outputPointerStart = ref<{ x: number; y: number } | null>(null);
const handleOutputPointerDown = (event: PointerEvent, intf: NodeInterface<unknown>) => {
  if (!isOutput.value) return;
  if (readLocation(intf) !== "right") return;
  outputPointerStart.value = { x: event.clientX, y: event.clientY };
};

const handleOutputPointerUp = (event: PointerEvent, intf: NodeInterface<unknown>) => {
  if (!isOutput.value) return;
  if (readLocation(intf) !== "right") return;
  const start = outputPointerStart.value;
  outputPointerStart.value = null;
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.hypot(dx, dy) > 6) return;
  props.onOutputConnector?.(intf);
};

/* Input connector: + badge on the left side of "input" type nodes */
const inputPointerStart = ref<{ x: number; y: number } | null>(null);
const handleInputPointerDown = (event: PointerEvent, intf: NodeInterface<unknown>) => {
  if (!isInput.value) return;
  event.stopPropagation();
  event.preventDefault();
  inputPointerStart.value = { x: event.clientX, y: event.clientY };
};

const handleInputPointerUp = (event: PointerEvent, intf: NodeInterface<unknown>) => {
  if (!isInput.value) return;
  event.stopPropagation();
  event.preventDefault();
  const start = inputPointerStart.value;
  inputPointerStart.value = null;
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.hypot(dx, dy) > 6) return;
  props.onInputConnector?.(intf);
};

/* Standalone input connector handlers (when no left ports exist yet) */
const handleInputPointerDownStandalone = (event: PointerEvent) => {
  if (!isInput.value) return;
  event.stopPropagation();
  event.preventDefault();
  inputPointerStart.value = { x: event.clientX, y: event.clientY };
};

const handleInputPointerUpStandalone = (event: PointerEvent) => {
  if (!isInput.value) return;
  event.stopPropagation();
  event.preventDefault();
  const start = inputPointerStart.value;
  inputPointerStart.value = null;
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.hypot(dx, dy) > 6) return;
  /* Pass the right-side output as the interface reference; App.vue will
     create the actual left-side input port on this resource node. */
  const rightIntf = rightPorts.value[0];
  if (rightIntf) props.onInputConnector?.(rightIntf);
};

const clampCount = (count: number) => (count > 0 ? count : 1);
const getPortStyle = (side: Location, index: number, count: number) => {
  const safeCount = clampCount(count);
  const fraction = (index + 1) / (safeCount + 1);

  if (side === "left") {
    return {
      position: "absolute",
      left: "0%",
      top: `${fraction * 100}%`,
      transform: "translate(-50%, -50%)",
    };
  }

  if (side === "right") {
    return {
      position: "absolute",
      left: "100%",
      top: `${fraction * 100}%`,
      transform: "translate(-50%, -50%)",
    };
  }

  if (side === "top") {
    return {
      position: "absolute",
      left: `${fraction * 100}%`,
      top: "0%",
      transform: "translate(-50%, -50%)",
    };
  }

  return {
    position: "absolute",
    left: `${fraction * 100}%`,
    top: "100%",
    transform: "translate(-50%, -50%)",
  };
};

const NodeInterfaceView = Components.NodeInterface;
</script>

<template>
  <div class="resource-node">
    <template v-for="(intf, index) in leftPorts" :key="intf.id">
      <NodeInterfaceView
        :node="node"
        :intf="intf"
        :style="getPortStyle(remapSide('left'), index, leftPorts.length)"
      />
      <!-- + badge to the left of existing left-side ports (upstream spawn) -->
      <span
        v-if="isInput && props.onInputConnector"
        class="output-add-badge"
        :style="{ position: 'absolute', left: 'calc(0% - 26px)', top: `${((index + 1) / (leftPorts.length + 1)) * 100}%`, transform: 'translate(0, -50%)', zIndex: 100 }"
        @pointerdown.capture.stop.prevent="handleInputPointerDown($event, intf)"
        @pointerup.capture.stop.prevent="handleInputPointerUp($event, intf)"
      >+</span>
    </template>

    <!-- Standalone + badge for input nodes that have no left ports yet -->
    <span
      v-if="isInput && leftPorts.length === 0 && props.onInputConnector"
      class="output-add-badge"
      :style="{ position: 'absolute', left: 'calc(0% - 26px)', top: '50%', transform: 'translate(0, -50%)', zIndex: 100 }"
      @pointerdown.capture.stop.prevent="handleInputPointerDownStandalone($event)"
      @pointerup.capture.stop.prevent="handleInputPointerUpStandalone($event)"
    >+</span>

    <template v-for="(intf, index) in rightPorts" :key="intf.id">
      <NodeInterfaceView
        :node="node"
        :intf="intf"
        :style="getPortStyle(remapSide('right'), index, rightPorts.length)"
        @pointerdown.capture="handleOutputPointerDown($event, intf)"
        @pointerup.capture="handleOutputPointerUp($event, intf)"
      />
      <!-- + badge to the right of right-side ports on output nodes (downstream spawn) -->
      <span
        v-if="isOutput"
        class="output-add-badge"
        :style="{ position: 'absolute', left: 'calc(100% + 10px)', top: `${((index + 1) / (rightPorts.length + 1)) * 100}%`, transform: 'translate(0, -50%)', zIndex: 100 }"
        @pointerdown.capture.stop.prevent="handleOutputPointerDown($event, intf)"
        @pointerup.capture.stop.prevent="handleOutputPointerUp($event, intf)"
      >+</span>
    </template>

    <NodeInterfaceView
      v-for="(intf, index) in topPorts"
      :key="intf.id"
      :node="node"
      :intf="intf"
      :style="getPortStyle(remapSide('top'), index, topPorts.length)"
    />

    <NodeInterfaceView
      v-for="(intf, index) in bottomPorts"
      :key="intf.id"
      :node="node"
      :intf="intf"
      :style="getPortStyle(remapSide('bottom'), index, bottomPorts.length)"
    />

    <div class="resource-title">
      <div class="title-input-wrap">
        <input
          v-model="titleDraft"
          class="title-input"
          type="text"
          @input="handleTitleInput"
          @focus="handleTitleFocus"
          @blur="handleTitleBlur"
        />
        <div
          v-if="isMainProductAutocompleteNode && (autocompleteOpen || autocompleteLoading)"
          class="title-autocomplete-panel"
        >
          <div v-if="autocompleteLoading" class="title-autocomplete-hint">Keresés…</div>
          <button
            v-for="option in autocompleteOptions"
            :key="option.uuid"
            type="button"
            class="title-autocomplete-option"
            @pointerdown.prevent="selectAutocompleteOption(option)"
          >
            <span class="title-autocomplete-main">{{ option.production_name || option.activity_name || option.uuid }}</span>
            <span class="title-autocomplete-sub">{{ option.location || '—' }} · {{ option.activity_name || 'n/a' }}</span>
          </button>
          <div v-if="!autocompleteLoading && autocompleteOptions.length === 0" class="title-autocomplete-hint">Nincs találat</div>
        </div>
      </div>
      <button v-show="!hasMultipleConnections" class="delete-btn" type="button" title="Delete" @click.stop="props.onDelete?.()">
        ×
      </button>
    </div>

    <div v-if="isInput" class="resource-fields">
      <div class="field-row">
        <span class="field-label">származás</span>
        <template v-if="editingOrigin">
          <input
            v-model="originDraft"
            class="field-input"
            type="text"
            placeholder=""
            @keyup.enter="saveOrigin"
            @blur="saveOrigin"
          />
        </template>
        <button v-else type="button" class="field-value" @click.stop="startEditOrigin">
          {{ readFields().origin || "-" }}
        </button>
      </div>
      <div class="field-row">
        <span class="field-label">mennyiség</span>
        <template v-if="editingInputQuantity">
          <input
            v-model="inputQuantityDraft"
            class="field-input"
            type="number"
            min="0"
            step="0.01"
            @keyup.enter="saveInputQuantity"
            @blur="saveInputQuantity"
          />
        </template>
        <button v-else type="button" class="field-value" @click.stop="startEditInputQuantity">
          {{ readFields().inputQuantity ?? 0 }}
        </button>
      </div>
      <div class="field-row">
        <span class="field-label">details</span>
        <textarea
          v-model="detailsDraft"
          class="field-textarea"
          rows="2"
          @blur="syncDetails"
        />
      </div>
    </div>

    <div v-else-if="isOutput" class="resource-fields">
      <div class="field-row">
        <span class="field-label">kg keletkezik 1 kimeneti főtermékkel</span>
        <template v-if="editingOutputKg">
          <input
            v-model="outputKgDraft"
            class="field-input"
            type="number"
            min="0.000001"
            step="0.01"
            @keyup.enter="saveOutputKg"
            @blur="saveOutputKg"
          />
        </template>
        <button v-else type="button" class="field-value" @click.stop="startEditOutputKg">
          {{ readFields().outputKg ?? 1 }}
        </button>
      </div>
      <div class="field-row">
        <span class="field-label">Hová kerül?</span>
        <template v-if="editingDestination">
          <input
            v-model="destinationDraft"
            class="field-input"
            type="text"
            placeholder=""
            @keyup.enter="saveDestination"
            @blur="saveDestination"
          />
        </template>
        <button v-else type="button" class="field-value" @click.stop="startEditDestination">
          {{ readFields().destination || "-" }}
        </button>
      </div>
    </div>

    <div v-else-if="isQuantityNode" class="resource-fields">
      <div class="field-row">
        <span class="field-label">mennyiség</span>
        <template v-if="editingQuantity">
          <input
            v-model="quantityDraft"
            class="field-input"
            type="number"
            min="0"
            step="0.01"
            @keyup.enter="saveQuantity"
            @blur="saveQuantity"
          />
        </template>
        <button v-else type="button" class="field-value" @click.stop="startEditQuantity">
          {{ readFields().quantity ?? 0 }}
        </button>
      </div>
    </div>

    <div v-else-if="isTimedNode" class="resource-fields">
      <div class="field-row">
        <span class="field-label">duration</span>
        <template v-if="editingDuration">
          <input
            v-model="durationDraft"
            class="field-input"
            type="text"
            placeholder=""
            @keyup.enter="saveDuration"
            @blur="saveDuration"
          />
        </template>
        <button v-else type="button" class="field-value" @click.stop="startEditDuration">
          {{ readFields().duration || "-" }}
        </button>
      </div>
      <div class="field-row">
        <span class="field-label">parameters</span>
        <textarea
          v-model="parametersDraft"
          class="field-textarea"
          rows="2"
          @blur="syncParameters"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-node {
  display: flex;
  align-items: center;
  background: hsl(var(--card));
  border: 1.5px solid hsl(var(--primary));
  border-radius: var(--radius);
  padding: 8px 12px;
  min-width: 100px;
  max-width: 200px;
  width: var(--width, auto);
  cursor: move;
  position: relative;
  gap: 8px;
  flex-wrap: wrap;
  box-shadow: var(--shadow-md);
}

.resource-node.selected {
  border-color: hsl(var(--accent));
  box-shadow: 0 0 0 3px hsl(var(--accent) / 0.2), var(--shadow-md);
}

.resource-node:active {
  cursor: grabbing;
}

.resource-title {
  flex: 1;
  text-align: center;
  color: hsl(var(--foreground));
  font-size: 11px;
  font-weight: 600;
  padding: 0 8px;
  white-space: nowrap;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.title-input-wrap {
  position: relative;
  width: 100%;
}

.title-input {
  width: 100%;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
  font-size: 12px;
  font-weight: 700;
  font-family: 'Space Grotesk', sans-serif;
  padding: 4px 6px;
  border-radius: calc(var(--radius) - 2px);
  text-align: center;
  transition: border-color 0.15s;
}

.title-input:focus {
  outline: none;
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15);
}

.title-autocomplete-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 250;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow: auto;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) - 2px);
  box-shadow: var(--shadow-md);
  padding: 4px;
}

.title-autocomplete-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius) - 4px);
  color: hsl(var(--foreground));
  cursor: pointer;
  padding: 6px;
}

.title-autocomplete-option:hover {
  background: hsl(var(--primary) / 0.1);
}

.title-autocomplete-main {
  font-size: 11px;
  font-weight: 600;
}

.title-autocomplete-sub {
  font-size: 10px;
  color: hsl(var(--muted-fg));
}

.title-autocomplete-hint {
  font-size: 10px;
  color: hsl(var(--muted-fg));
  padding: 4px 6px;
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
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.delete-btn:hover {
  background: hsl(var(--destructive) / 0.1);
  border-color: hsl(var(--destructive));
  color: hsl(var(--destructive));
}

.resource-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: hsl(var(--foreground));
}

.field-label {
  font-weight: 600;
  color: hsl(var(--muted-fg));
}

.field-value {
  background: transparent;
  border: 1px dashed hsl(var(--primary) / 0.5);
  color: hsl(var(--foreground));
  font-size: 10px;
  padding: 4px 6px;
  border-radius: calc(var(--radius) - 2px);
  text-align: left;
  cursor: text;
  transition: background 0.12s;
}

.field-value:hover {
  background: hsl(var(--primary) / 0.07);
}

.field-input {
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
  font-size: 10px;
  padding: 4px 6px;
  border-radius: calc(var(--radius) - 2px);
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12);
}

.field-textarea {
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
  font-size: 10px;
  padding: 4px 6px;
  border-radius: calc(var(--radius) - 2px);
  outline: none;
  resize: vertical;
  min-height: 40px;
  transition: border-color 0.15s;
}

.field-textarea:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12);
}

.resource-node :deep(.baklava-node-interface) {
  width: 12px;
  height: 12px;
  padding: 0;
  margin: 0;
  line-height: 0;
  font-size: 0;
}

@media (max-width: 768px) {
  .resource-node {
    padding: 10px 14px;
  }

  .resource-node :deep(.baklava-node-interface) {
    width: 16px;
    height: 16px;
  }

  .title-input {
    font-size: 13px;
  }

  .field-input,
  .field-textarea,
  .field-value {
    font-size: 12px;
  }
}

.resource-node :deep(.baklava-node-interface > span) {
  display: none;
}

.output-add-badge {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: hsl(var(--accent));
  color: hsl(var(--background));
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 0 0 2px hsl(var(--accent) / 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}

.output-add-badge:hover {
  box-shadow: 0 0 0 4px hsl(var(--accent) / 0.55);
  background: hsl(var(--primary));
}

</style>
