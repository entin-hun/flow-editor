<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { DependencyEngine } from "@baklavajs/engine";
import { BaklavaEditor, Components, setNodePosition, useBaklava } from "@baklavajs/renderer-vue";
import type { NodeInterface } from "@baklavajs/core";
import Idef0Node from "./components/Idef0Node.vue";
import ResourceNodeVue from "./components/ResourceNode.vue";
import { ProcessNode } from "./nodes/ProcessNode";
import { ResourceNode } from "./nodes/ResourceNode";
import { getStoredAuthToken, getStoredEmail, initReownAppKit, openReownModal } from "./services/reownAppkit";

const baklava = useBaklava();
const showInstructions = ref(false); // Start with instructions hidden
const debugEnabled = false;
const saveStatus = ref("");
const isSaving = ref(false);
const currentFlowId = ref<string | null>(null);
const suppressAutoArrange = ref(false);
const authToken = ref<string | null>(null);
const pendingSave = ref(false);
const draftStorageKey = "flow-editor-draft";
const contactEmailStorageKey = "flow-editor-contact-email";
const contactPhoneStorageKey = "flow-editor-contact-phone";
const contactEmail = ref("");
const contactPhone = ref("");
const saveError = ref("");

const FLOW_API_BASE = import.meta.env.VITE_FLOW_API_BASE || "";

const getAuthToken = () => authToken.value || getStoredAuthToken();
const readStoredEmail = () => getStoredEmail() || "";

// Restore contact fields from localStorage
const restoreContactFields = () => {
  if (typeof window === "undefined") return;
  const storedEmail = window.localStorage.getItem(contactEmailStorageKey);
  if (storedEmail) {
    contactEmail.value = storedEmail;
  }
  const storedPhone = window.localStorage.getItem(contactPhoneStorageKey);
  if (storedPhone) {
    contactPhone.value = storedPhone;
  }
};

// Setup watchers for auto-save on field changes.
// NOTE: Do NOT use { immediate: true } — it fires during setup with the
// initial "" value, which calls removeItem and deletes the stored values
// BEFORE restoreContactFields() can read them in onMounted().
watch(
  () => contactEmail.value,
  (newEmail) => {
    if (typeof window === "undefined") return;
    if (newEmail?.trim()) {
      window.localStorage.setItem(contactEmailStorageKey, newEmail.trim());
    } else {
      window.localStorage.removeItem(contactEmailStorageKey);
    }
  }
);

watch(
  () => contactPhone.value,
  (newPhone) => {
    if (typeof window === "undefined") return;
    if (newPhone?.trim()) {
      window.localStorage.setItem(contactPhoneStorageKey, newPhone.trim());
    } else {
      window.localStorage.removeItem(contactPhoneStorageKey);
    }
  }
);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const parseFlowIdFromUrl = () => {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/s\/([^/]+)$/);
  return match ? match[1] : null;
};

const updateUrlWithId = (id: string) => {
  if (typeof window === "undefined") return;
  const nextPath = `/s/${id}`;
  if (window.location.pathname !== nextPath) {
    window.history.replaceState({}, "", nextPath);
  }
};

type SavedNodeMeta = {
  id: string;
  type: string;
  title?: string;
  position: { x: number; y: number };
  resourceType?: string;
  fields?: Record<string, unknown>;
  details?: string;
};

type FlowPayload = {
  version: number;
  graph: any;
  nodes: SavedNodeMeta[];
  view?: { scaling?: number; panning?: { x: number; y: number } };
  contact?: { email?: string; phone?: string };
  updatedAt: string;
};

const buildFlowPayload = (): FlowPayload => {
  const graph = baklava.displayedGraph;
  const nodes = graph.nodes.map((node: any) => {
    const meta: SavedNodeMeta = {
      id: node.id,
      type: node.type,
      title: node.title,
      position: { x: node.position.x, y: node.position.y },
    };

    if (node.type === "ResourceNode") {
      meta.resourceType = node.resourceType;
      meta.fields = node.fields;
    }

    if (node.type === "ProcessNode") {
      meta.details = node.details;
    }

    return meta;
  });

  return {
    version: 1,
    graph: graph.save(),
    nodes,
    view: {
      scaling: graph.scaling,
      panning: graph.panning ? { x: graph.panning.x, y: graph.panning.y } : undefined,
    },
    contact: {
      email: contactEmail.value.trim() || undefined,
      phone: contactPhone.value.trim() || undefined,
    },
    updatedAt: new Date().toISOString(),
  };
};

const storeDraftToSession = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(draftStorageKey, JSON.stringify(buildFlowPayload()));
};

const restoreDraftFromSession = () => {
  if (typeof window === "undefined") return false;
  const raw = window.sessionStorage.getItem(draftStorageKey);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw) as FlowPayload;
    applyFlowPayload(payload);
    return true;
  } catch (error) {
    console.warn("[Flow] Failed to restore draft", error);
    return false;
  } finally {
    window.sessionStorage.removeItem(draftStorageKey);
  }
};

const applyFlowPayload = (payload: FlowPayload) => {
  const graph = baklava.displayedGraph;
  suppressAutoArrange.value = true;

  // Enrich graph node states with metadata from payload.nodes
  // so that node.load() can restore resourceType, portMeta, etc.
  // This covers both old saves (no resourceType in graph state) and new saves.
  const metaById = new Map(payload.nodes.map((meta) => [meta.id, meta]));
  const enrichedGraph = { ...payload.graph };
  if (enrichedGraph.nodes && Array.isArray(enrichedGraph.nodes)) {
    enrichedGraph.nodes = enrichedGraph.nodes.map((nodeState: any) => {
      const meta = metaById.get(nodeState.id);
      if (!meta) return nodeState;
      const enriched = { ...nodeState };
      if (meta.resourceType && !enriched.resourceType) {
        enriched.resourceType = meta.resourceType;
      }
      if (meta.fields && !enriched.fields) {
        enriched.fields = meta.fields;
      }
      if (meta.details !== undefined && enriched.details === undefined) {
        enriched.details = meta.details;
      }
      return enriched;
    });
  }

  // Ensure graph state has required arrays before loading
  if (!enrichedGraph.nodes) enrichedGraph.nodes = [];
  if (!enrichedGraph.connections) enrichedGraph.connections = [];

  graph.load(enrichedGraph);

  graph.nodes.forEach((node: any) => {
    const meta = metaById.get(node.id);
    if (!meta) return;
    if (meta.title) node.title = meta.title;
    if (meta.position) {
      node.position.x = meta.position.x;
      node.position.y = meta.position.y;
      setNodePosition(node, meta.position.x, meta.position.y);
    }
    if (node.type === "ResourceNode") {
      node.resourceType = meta.resourceType ?? node.resourceType;
      node.fields = meta.fields ?? node.fields;
    }
    if (node.type === "ProcessNode") {
      node.details = meta.details ?? node.details;
    }
  });

  if (payload.view?.scaling) {
    graph.scaling = payload.view.scaling;
  }
  if (payload.view?.panning) {
    graph.panning = { x: payload.view.panning.x, y: payload.view.panning.y } as any;
  }

  if (payload.contact?.email && !contactEmail.value.trim()) {
    // Only use backend email if localStorage doesn't have a newer value
    const localEmail = window.localStorage.getItem(contactEmailStorageKey);
    contactEmail.value = localEmail || payload.contact.email;
  }
  if (payload.contact?.phone && !contactPhone.value.trim()) {
    // Only use backend phone if localStorage doesn't have a newer value
    const localPhone = window.localStorage.getItem(contactPhoneStorageKey);
    contactPhone.value = localPhone || payload.contact.phone;
  }

  // Nodes need time to render in DOM before BaklavaJS can compute
  // port coordinates for connections. Use multiple retries with increasing delays.
  const scheduleRefresh = () => {
    suppressAutoArrange.value = false;
    const delays = [0, 50, 150, 400, 800];
    delays.forEach((delay) => {
      setTimeout(() => {
        refreshConnectionCoords();
        updateConnectionArrows();
      }, delay);
    });
  };
  nextTick(scheduleRefresh);
};

const loadFlowById = async (id: string) => {
  const response = await fetch(`${FLOW_API_BASE}/api/flows/${id}`);
  if (!response.ok) {
    saveStatus.value = "Failed to load flow";
    return;
  }
  const payload = (await response.json()) as FlowPayload;
  applyFlowPayload(payload);
};

const handleSaveFlow = async () => {
  if (isSaving.value) return;
  saveError.value = "";
  const trimmedPhone = contactPhone.value.trim();
  if (!trimmedPhone) {
    saveError.value = "Phone number is required.";
    return;
  }

  if (!contactEmail.value.trim()) {
    const storedEmail = readStoredEmail();
    if (storedEmail) {
      contactEmail.value = storedEmail;
    }
  }

  if (!contactEmail.value.trim()) {
    const token = getAuthToken();
    if (!currentFlowId.value && !token) {
      pendingSave.value = true;
      storeDraftToSession();
      await openReownModal();
      return;
    }
    saveError.value = "Email is required.";
    return;
  }

  if (!isValidEmail(contactEmail.value.trim())) {
    saveError.value = "Enter a valid email address.";
    return;
  }

  const token = getAuthToken();
  if (!currentFlowId.value && !token) {
    pendingSave.value = true;
    storeDraftToSession();
    await openReownModal();
    return;
  }

  try {
    isSaving.value = true;
    saveStatus.value = "Saving...";
    const payload = buildFlowPayload();
    const isUpdate = Boolean(currentFlowId.value);
    const endpoint = isUpdate ? `/api/flows/${currentFlowId.value}` : "/api/flows";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${FLOW_API_BASE}${endpoint}`, {
      method: isUpdate ? "PUT" : "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      saveStatus.value = "Save failed";
      return;
    }

    const result = await response.json();
    if (!isUpdate && result?.id) {
      currentFlowId.value = result.id;
      updateUrlWithId(result.id);
    }
    saveStatus.value = "Saved";
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(draftStorageKey);
    }
  } catch (error) {
    console.error(error);
    if (error instanceof DOMException && error.name === "AbortError") {
      saveStatus.value = "Save timed out";
    } else {
      saveStatus.value = "Save failed";
    }
  } finally {
    isSaving.value = false;
    setTimeout(() => {
      if (saveStatus.value === "Saved") saveStatus.value = "";
    }, 2000);
  }
};

const startReownLogin = () => {
  openReownModal();
};

// Configure editor options - disable sidebar, toolbar, and palette
baklava.settings.sidebar.enabled = false;
baklava.settings.sidebar.resizable = false;
baklava.settings.toolbar.enabled = false; // Disable toolbar with subgraph commands
baklava.settings.palette.enabled = false; // Disable node palette
baklava.settings.useStraightConnections = true; // Straight lines instead of bezier curves

const applyMobileSettings = () => {
  if (typeof window === "undefined") return;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.matchMedia("(max-width: 768px)").matches;
  if (!isTouch && !isNarrow) return;

  baklava.settings.panZoom.minScale = 0.3;
  baklava.settings.panZoom.maxScale = 2.5;
  baklava.settings.background.gridSize = 80;
  baklava.settings.background.gridDivision = 4;
  baklava.settings.nodes.resizable = false;
  baklava.settings.nodes.defaultWidth = 200;
  baklava.settings.nodes.minWidth = 160;
  baklava.settings.nodes.maxWidth = 260;
};

applyMobileSettings();

baklava.editor.registerNodeType(ProcessNode, {
  category: "Trace Market",
  title: "Process Node",
});

baklava.editor.registerNodeType(ResourceNode, {
  category: "Trace Market",
  title: "Resource Node",
});

const engine = new DependencyEngine(baklava.editor);
engine.start();

type PortMeta = {
  fieldPath?: string;
  location?: "left" | "right" | "top" | "bottom";
};

const getMeta = (intf: NodeInterface<unknown>) => (intf as NodeInterface<unknown> & { data?: PortMeta }).data;

const findOutputByField = (node: ProcessNode, fieldPath: string) =>
  Object.values(node.outputs).find((intf) => getMeta(intf)?.fieldPath === fieldPath);

const findInputByField = (node: ProcessNode, fieldPath: string) =>
  Object.values(node.inputs).find((intf) => getMeta(intf)?.fieldPath === fieldPath);

// Improved auto-layout algorithm - minimizes line length and crossings
const logGraphState = (label: string) => {
  if (!debugEnabled) return;
  const graph = baklava.displayedGraph;
  console.log(`[IDEF0] ${label}`, {
    nodes: graph.nodes.length,
    connections: graph.connections.length,
    scaling: graph.scaling,
    panning: graph.panning,
  });
};

const installConnectionMarkers = () => {
  // .connections-container IS the <svg> element (not a wrapper div)
  const svg = document.querySelector(".connections-container") as SVGSVGElement | null;
  if (!svg) return false;

  const existing = svg.querySelector("#connection-arrow") as SVGMarkerElement | null;
  if (existing) return true;

  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.prepend(defs);
  }

  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "connection-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "5");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("orient", "auto");

  const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrowPath.setAttribute("fill", "#4fc3f7");

  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  return true;
};

/**
 * Calculate the midpoint and tangent angle of a cubic bezier at t=0.5
 */
const bezierMidpoint = (x1: number, y1: number, cx1: number, cy1: number, cx2: number, cy2: number, x2: number, y2: number) => {
  const t = 0.5;
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  const mx = mt3 * x1 + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * x2;
  const my = mt3 * y1 + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * y2;

  // Tangent at t=0.5
  const dx = 3 * mt2 * (cx1 - x1) + 6 * mt * t * (cx2 - cx1) + 3 * t2 * (x2 - cx2);
  const dy = 3 * mt2 * (cy1 - y1) + 6 * mt * t * (cy2 - cy1) + 3 * t2 * (y2 - cy2);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return { mx, my, angle };
};

/**
 * Parse a connection path.
 * Cubic bezier: "M x1 y1 C cx1 cy1, cx2 cy2, x2 y2" → 8 numbers
 * Straight line: "M x1 y1 L x2 y2" → 4 numbers (control points = endpoints)
 */
const parseBezierPath = (d: string) => {
  const nums = d.match(/-?[\d.]+/g);
  if (!nums) return null;
  if (nums.length >= 8) {
    return nums.slice(0, 8).map(Number) as [number, number, number, number, number, number, number, number];
  }
  if (nums.length >= 4) {
    // Straight line: treat as bezier with control points at endpoints
    const [x1, y1, x2, y2] = nums.map(Number);
    return [x1, y1, x1, y1, x2, y2, x2, y2] as [number, number, number, number, number, number, number, number];
  }
  return null;
};

/**
 * Update arrow overlays at the midpoint of each connection path.
 * Called after node positions change.
 */
const updateConnectionArrows = () => {
  const svg = document.querySelector(".connections-container") as SVGSVGElement | null;
  if (!svg) return;

  // Remove stale arrows
  svg.querySelectorAll(".connection-arrow-overlay").forEach((el) => el.remove());

  const paths = svg.querySelectorAll<SVGPathElement>(".baklava-connection");
  paths.forEach((pathEl) => {
    const d = pathEl.getAttribute("d");
    if (!d) return;
    const coords = parseBezierPath(d);
    if (!coords) return;

    const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = coords;
    const { mx, my, angle } = bezierMidpoint(x1, y1, cx1, cy1, cx2, cy2, x2, y2);

    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arrow.setAttribute("class", "connection-arrow-overlay");
    arrow.setAttribute("points", "-10,-8 10,0 -10,8");
    arrow.setAttribute("fill", "#4fc3f7");
    arrow.setAttribute("transform", `translate(${mx},${my}) rotate(${angle})`);
    arrow.style.pointerEvents = "none";
    svg.appendChild(arrow);
  });
};

const ensureDemoConnections = () => {
  const graph = baklava.displayedGraph;
  if (graph.connections.length > 0) return false;

  const processes = graph.nodes.filter((n) => n.type === "ProcessNode") as ProcessNode[];
  const process =
    processes.find((n) => n.title === "Process") ||
    processes[0];
  const wasteProcess = processes.find((n) => n.title === "Hulladékkezelés");
  const resources = graph.nodes.filter((n) => n.type === "ResourceNode") as ResourceNode[];
  if (!process || resources.length === 0) return false;

  const findResource = (title: string, type: string) =>
    resources.find((n) => (n as any).resourceType === type && n.title === title);

  const inputs = resources.filter((n) => (n as any).resourceType === "input");
  const outputs = resources.filter((n) => (n as any).resourceType === "output");
  const machines = resources.filter((n) => (n as any).resourceType === "machine");
  const energies = resources.filter((n) => (n as any).resourceType === "energy");
  const gases = resources.filter((n) => (n as any).resourceType === "gas");
  const waters = resources.filter((n) => (n as any).resourceType === "water");
  const services = resources.filter((n) => (n as any).resourceType === "service");
  const properties = resources.filter((n) => (n as any).resourceType === "property");

  const input1 = findResource("Steel Sheet", "input") || inputs[0];
  const input2 = findResource("Paint", "input") || inputs[1] || inputs[0];
  const machine = findResource("Press Machine", "machine") || machines[0];
  const energy = findResource("Electricity", "energy") || energies[0];
  const gas = findResource("Gáz (m3)", "gas") || gases[0];
  const water = findResource("Víz (m3)", "water") || waters[0];
  const service = findResource("Szolgáltatás", "service") || services[0];
  const property = findResource("Ingatlan", "property") || properties[0];
  const output1 = findResource("Car Door", "output") || outputs[0];
  const output2 = findResource("Scrap Metal", "output") || outputs[1] || outputs[0];

  if (!input1 || !input2 || !machine || !energy || !gas || !water || !service || !property || !output1 || !output2) return false;

  const hasConnection = (from: NodeInterface<unknown>, to: NodeInterface<unknown>) =>
    graph.connections.some((c) => c.from === from && c.to === to);

  const input1Output = Object.values(input1.outputs)[0];
  const input2Output = Object.values(input2.outputs)[0];
  const processInput1 = findInputByField(process, "inputInstance.material");
  const processInput2 = findInputByField(process, "inputInstance.quantity");

  if (input1Output && processInput1 && !hasConnection(input1Output, processInput1)) {
    graph.addConnection(input1Output, processInput1);
  }
  if (input2Output && processInput2 && !hasConnection(input2Output, processInput2)) {
    graph.addConnection(input2Output, processInput2);
  }

  const machineOutput = Object.values(machine.outputs)[0];
  const energyOutput = Object.values(energy.outputs)[0];
  const processMachine = findInputByField(process, "machineInstance.category");
  const processEnergy = findInputByField(process, "machineInstance.quantity");
  const processGas = findInputByField(process, "serviceInstance.gas");
  const processWater = findInputByField(process, "serviceInstance.water");
  const processService = findInputByField(process, "serviceInstance.service");
  const processProperty = findInputByField(process, "serviceInstance.property");

  if (machineOutput && processMachine && !hasConnection(machineOutput, processMachine)) {
    graph.addConnection(machineOutput, processMachine);
  }
  if (energyOutput && processEnergy && !hasConnection(energyOutput, processEnergy)) {
    graph.addConnection(energyOutput, processEnergy);
  }
  const gasOutput = Object.values(gas.outputs)[0];
  const waterOutput = Object.values(water.outputs)[0];
  const serviceOutput = Object.values(service.outputs)[0];
  const propertyOutput = Object.values(property.outputs)[0];

  if (gasOutput && processGas && !hasConnection(gasOutput, processGas)) {
    graph.addConnection(gasOutput, processGas);
  }
  if (waterOutput && processWater && !hasConnection(waterOutput, processWater)) {
    graph.addConnection(waterOutput, processWater);
  }
  if (serviceOutput && processService && !hasConnection(serviceOutput, processService)) {
    graph.addConnection(serviceOutput, processService);
  }
  if (propertyOutput && processProperty && !hasConnection(propertyOutput, processProperty)) {
    graph.addConnection(propertyOutput, processProperty);
  }

  const processOutput1 = findOutputByField(process, "output.mainProduct");
  const processOutput2 = findOutputByField(process, "output.byproduct");
  const output1Input = Object.values(output1.inputs)[0];
  const output2Input = Object.values(output2.inputs)[0];
  const output2Output = Object.values(output2.outputs)[0];

  if (processOutput1 && output1Input && !hasConnection(processOutput1, output1Input)) {
    graph.addConnection(processOutput1, output1Input);
  }
  if (processOutput2 && output2Input && !hasConnection(processOutput2, output2Input)) {
    graph.addConnection(processOutput2, output2Input);
  }

  if (output2Output && wasteProcess) {
    const wasteInput = findInputByField(wasteProcess, "inputInstance.material");
    if (wasteInput && !hasConnection(output2Output, wasteInput)) {
      graph.addConnection(output2Output, wasteInput);
    }
  }

  return true;
};

const refreshConnectionCoords = () => {
  const graph = baklava.displayedGraph;
  if (graph.nodes.length === 0) return;

  const epsilon = 0.01;
  requestAnimationFrame(() => {
    graph.nodes.forEach((node) => {
      setNodePosition(node as any, node.position.x + epsilon, node.position.y + epsilon);
    });
    requestAnimationFrame(() => {
      graph.nodes.forEach((node) => {
        setNodePosition(node as any, node.position.x - epsilon, node.position.y - epsilon);
      });
      // Update arrows after positions settle
      requestAnimationFrame(() => updateConnectionArrows());
    });
  });
};

const deleteNode = (node: ProcessNode | ResourceNode) => {
  const graph = baklava.displayedGraph as any;
  if (graph?.removeNode) {
    graph.removeNode(node);
    refreshConnectionCoords();
  }
};

const addInputPort = (process: ProcessNode) => {
  const graph = baklava.displayedGraph;
  const existingInputs = Object.values(process.inputs).filter((intf) => getMeta(intf)?.location === "left");
  const nextIndex = existingInputs.length + 1;

  const resource = graph.addNode(new ResourceNode("input"));
  if (!resource) return;

  (resource as any).title = `Input ${nextIndex}`;
  const outputPort = Object.values(resource.outputs)[0];
  const processPort = process.addFlowInterface(`Input ${nextIndex}`, "material", "input");

  if (outputPort && processPort) {
    graph.addConnection(outputPort, processPort);
  }

  autoArrangeNodes();
  refreshConnectionCoords();
};

const addOutputPort = (process: ProcessNode) => {
  const graph = baklava.displayedGraph;
  const existingOutputs = Object.values(process.outputs).filter((intf) => getMeta(intf)?.location === "right");
  const nextIndex = existingOutputs.length + 1;

  const resource = graph.addNode(new ResourceNode("output"));
  if (!resource) return;

  (resource as any).title = `Output ${nextIndex}`;
  const inputPort = Object.values(resource.inputs)[0];
  const processPort = process.addFlowInterface(`Output ${nextIndex}`, "product", "output");

  if (processPort && inputPort) {
    graph.addConnection(processPort, inputPort);
  }

  autoArrangeNodes();
  refreshConnectionCoords();
};

const addMechanismPort = (process: ProcessNode) => {
  const graph = baklava.displayedGraph;
  const existingMechanisms = Object.values(process.inputs).filter((intf) => getMeta(intf)?.location === "bottom");
  const nextIndex = existingMechanisms.length + 1;

  const resource = graph.addNode(new ResourceNode("service"));
  if (!resource) return;

  (resource as any).title = `Szolgáltatás ${nextIndex}`;
  const outputPort = Object.values(resource.outputs)[0];
  const processPort = process.addFlowInterface(`Szolgáltatás ${nextIndex}`, "service", "service");

  if (outputPort && processPort) {
    graph.addConnection(outputPort, processPort);
  }

  autoArrangeNodes();
  refreshConnectionCoords();
};

const addProcessFromOutput = (resource: ResourceNode, intf: NodeInterface<unknown>) => {
  const graph = baklava.displayedGraph;
  if (!graph || !resource || !intf) return;

  const processCount = graph.nodes.filter((n) => n.type === "ProcessNode").length;
  const process = graph.addNode(new ProcessNode());
  if (!process) return;

  (process as any).title = `Process ${processCount + 1}`;
  const processInput = Object.values(process.inputs).find((port) => getMeta(port)?.location === "left") as
    | NodeInterface<unknown>
    | undefined;

  if (processInput) {
    graph.addConnection(intf, processInput);
  }

  const resourceEl = document.getElementById(resource.id);
  const resourceRect = resourceEl ? resourceEl.getBoundingClientRect() : null;
  const scale = graph.scaling || 1;
  const resourceWidth = resourceRect ? resourceRect.width / scale : 200;
  const x = resource.position.x + resourceWidth + 60;
  const y = resource.position.y;
  process.position.x = x;
  process.position.y = y;
  setNodePosition(process as any, x, y);
  autoArrangeNodes();
  refreshConnectionCoords();
};

const autoArrangeNodes = () => {
  const graph = baklava.displayedGraph;
  const nodes = graph.nodes;

  if (nodes.length === 0) return;

  if (debugEnabled) {
    console.group("[IDEF0] autoArrangeNodes");
    console.log("graph", {
      scaling: graph.scaling,
      panning: graph.panning,
      nodes: graph.nodes.length,
      connections: graph.connections.length,
    });
  }

  const processNodes = nodes.filter((n) => n.type === "ProcessNode");
  const resourceNodes = nodes.filter((n) => n.type === "ResourceNode");

  const getNodeSize = (node: any, fallback: { width: number; height: number }) => {
    const el = document.getElementById(node.id);
    if (!el) return fallback;
    const rect = el.getBoundingClientRect();
    const scale = graph.scaling || 1;
    return {
      width: rect.width / scale,
      height: rect.height / scale,
    };
  };

  const centerX = window.innerWidth / (2 * graph.scaling) - graph.panning.x;
  const centerY = window.innerHeight / (2 * graph.scaling) - graph.panning.y;

  const setPos = (node: any, x: number, y: number) => {
    node.position.x = x;
    node.position.y = y;
    setNodePosition(node, x, y);
    if (debugEnabled) {
      console.log("setPos", node.type, node.title, { x, y });
    }
  };

  const isPortrait = window.innerHeight > window.innerWidth;

  if (isPortrait) {
    const mainProcess = processNodes.find((node) => node.title === "Process") || processNodes[0];

    if (mainProcess) {
      const size = getNodeSize(mainProcess, { width: 200, height: 180 });
      const x = centerX - size.width / 2;
      const y = centerY - size.height / 2 - 20;
      setPos(mainProcess, x, y);
    }

    const inputs: ResourceNode[] = [];
    const outputs: ResourceNode[] = [];
    const mechanisms: ResourceNode[] = [];

    resourceNodes.forEach((resNode) => {
      const resType = (resNode as any).resourceType;
      if (resType === "input") inputs.push(resNode as ResourceNode);
      else if (resType === "output") outputs.push(resNode as ResourceNode);
      else mechanisms.push(resNode as ResourceNode);
    });

    const offsetFromProcess = 180;
    const mechanismGap = 90;
    const rowGap = 20;
    const columnGap = 20;

    const interfaceNodeMap = new Map<NodeInterface<unknown>, any>();
    nodes.forEach((node: any) => {
      Object.values(node.inputs || {}).forEach((intf: NodeInterface<unknown>) => interfaceNodeMap.set(intf, node));
      Object.values(node.outputs || {}).forEach((intf: NodeInterface<unknown>) => interfaceNodeMap.set(intf, node));
    });

    const inputGroups = new Map<ProcessNode, ResourceNode[]>();
    inputs.forEach((inputNode) => {
      const outputIntf = Object.values(inputNode.outputs || {})[0] as NodeInterface<unknown> | undefined;
      const connection = graph.connections.find((c) => c.from === outputIntf);
      const owner = connection ? interfaceNodeMap.get(connection.to) : mainProcess;
      const ownerProcess = (owner && owner.type === "ProcessNode") ? (owner as ProcessNode) : mainProcess;
      if (!ownerProcess) return;
      if (!inputGroups.has(ownerProcess)) inputGroups.set(ownerProcess, []);
      inputGroups.get(ownerProcess)?.push(inputNode);
    });

    const outputGroups = new Map<ProcessNode, ResourceNode[]>();
    outputs.forEach((outputNode) => {
      const inputIntf = Object.values(outputNode.inputs || {})[0] as NodeInterface<unknown> | undefined;
      const connection = graph.connections.find((c) => c.to === inputIntf);
      const owner = connection ? interfaceNodeMap.get(connection.from) : mainProcess;
      const ownerProcess = (owner && owner.type === "ProcessNode") ? (owner as ProcessNode) : mainProcess;
      if (!ownerProcess) return;
      if (!outputGroups.has(ownerProcess)) outputGroups.set(ownerProcess, []);
      outputGroups.get(ownerProcess)?.push(outputNode);
    });

    const getRowMetrics = (items: any[], fallback: { width: number; height: number } = { width: 200, height: 120 }) => {
      const sizes = items.map((node) => getNodeSize(node, fallback));
      const totalWidth = sizes.reduce((sum, size) => sum + size.width, 0) + Math.max(0, items.length - 1) * rowGap;
      const maxHeight = sizes.reduce((max, size) => Math.max(max, size.height), 0);
      return { sizes, totalWidth, maxHeight };
    };

    const placeRowFromMetrics = (items: any[], metrics: { sizes: { width: number; height: number }[]; totalWidth: number }, centerXPos: number, y: number) => {
      if (!items.length) return;
      let currentX = centerXPos - metrics.totalWidth / 2;
      items.forEach((node, index) => {
        const size = metrics.sizes[index];
        setPos(node, currentX, y);
        currentX += size.width + rowGap;
      });
    };

    const placeColumnRight = (items: ResourceNode[], x: number, centerYPos: number) => {
      if (!items.length) return;
      const sizes = items.map((node) => getNodeSize(node, { width: 200, height: 120 }));
      const totalHeight = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, items.length - 1) * columnGap;
      let currentY = centerYPos - totalHeight / 2;
      items.forEach((node, index) => {
        const size = sizes[index];
        setPos(node, x, currentY);
        currentY += size.height + columnGap;
      });
    };

    const processRect = mainProcess ? getNodeSize(mainProcess, { width: 200, height: 180 }) : { width: 200, height: 180 };
    const processX = mainProcess ? mainProcess.position.x + processRect.width / 2 : centerX;
    const processY = mainProcess ? mainProcess.position.y + processRect.height / 2 : centerY;

    const inputGroup = mainProcess ? (inputGroups.get(mainProcess) || []) : [];
    const inputMetrics = getRowMetrics(inputGroup);
    const inputRowY = processY - processRect.height / 2 - offsetFromProcess - inputMetrics.maxHeight;
    placeRowFromMetrics(inputGroup, inputMetrics, processX, inputRowY);

    const outputGroup = mainProcess ? (outputGroups.get(mainProcess) || []) : [];
    const outputMetrics = getRowMetrics(outputGroup);
    const outputRowY = processY + processRect.height / 2 + offsetFromProcess;
    placeRowFromMetrics(outputGroup, outputMetrics, processX, outputRowY);

    const secondaryProcesses = processNodes.filter((node) => node !== mainProcess);
    if (secondaryProcesses.length > 0) {
      const secondaryInputsMax = Math.max(
        0,
        ...secondaryProcesses.map((node) => getRowMetrics(inputGroups.get(node as ProcessNode) || []).maxHeight)
      );
      const outputsBottom = outputRowY + outputMetrics.maxHeight;
      const secondaryRowY = outputsBottom + offsetFromProcess + secondaryInputsMax + 40;
      const secondaryMetrics = getRowMetrics(secondaryProcesses as any[], { width: 200, height: 180 });
      placeRowFromMetrics(secondaryProcesses as any[], secondaryMetrics, processX, secondaryRowY);

      secondaryProcesses.forEach((processNode) => {
        const procSize = getNodeSize(processNode, { width: 200, height: 180 });
        const procX = processNode.position.x + procSize.width / 2;
        const procY = processNode.position.y + procSize.height / 2;

        const procOutputs = outputGroups.get(processNode as ProcessNode) || [];
        const procOutputsMetrics = getRowMetrics(procOutputs);
        const procOutputY = procY + procSize.height / 2 + offsetFromProcess;
        placeRowFromMetrics(procOutputs, procOutputsMetrics, procX, procOutputY);

        const procInputs = inputGroups.get(processNode as ProcessNode) || [];
        const procInputsMetrics = getRowMetrics(procInputs);
        const procInputY = procY - procSize.height / 2 - offsetFromProcess - procInputsMetrics.maxHeight;
        placeRowFromMetrics(procInputs, procInputsMetrics, procX, procInputY);
      });
    }

    const maxRowRight = Math.max(
      processX + inputMetrics.totalWidth / 2,
      processX + outputMetrics.totalWidth / 2,
      processX + processRect.width / 2
    );
    const mechanismX = maxRowRight + mechanismGap;
    placeColumnRight(mechanisms, mechanismX, processY);

    if (debugEnabled) {
      console.groupEnd();
    }
    refreshConnectionCoords();
    return;
  }

  const mainProcess = processNodes.find((node) => node.title === "Process") || processNodes[0];

  if (mainProcess) {
    const size = getNodeSize(mainProcess, { width: 200, height: 180 });
    const x = centerX - size.width / 2;
    const y = centerY - size.height / 2 - 40;
    setPos(mainProcess, x, y);
  }


  const inputs: any[] = [];
  const outputs: any[] = [];
  const mechanisms: any[] = [];

  resourceNodes.forEach((resNode) => {
    const resType = (resNode as any).resourceType;
    if (resType === "input") inputs.push(resNode);
    else if (resType === "output") outputs.push(resNode);
    else mechanisms.push(resNode);
  });

  const offsetFromProcess = 220;
  const verticalGap = 30;
  const mechanismGap = 40;
  const primaryProcess = mainProcess || processNodes[0];
  const processSize = primaryProcess ? getNodeSize(primaryProcess, { width: 200, height: 180 }) : { width: 200, height: 180 };
  const processLeft = centerX - processSize.width / 2;
  const processRight = centerX + processSize.width / 2;
  const processTop = centerY - processSize.height / 2 - 40;
  const processBottom = centerY + processSize.height / 2 - 40;

  const stackVertically = (items: any[]) => {
    const sizes = items.map((node) => getNodeSize(node, { width: 200, height: 120 }));
    const totalHeight = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, items.length - 1) * verticalGap;
    let currentY = centerY - totalHeight / 2;
    return items.map((node, index) => {
      const size = sizes[index];
      const y = currentY;
      currentY += size.height + verticalGap;
      return { node, size, y };
    });
  };

  const interfaceNodeMap = new Map<NodeInterface<unknown>, any>();
  nodes.forEach((node: any) => {
    Object.values(node.inputs || {}).forEach((intf: NodeInterface<unknown>) => interfaceNodeMap.set(intf, node));
    Object.values(node.outputs || {}).forEach((intf: NodeInterface<unknown>) => interfaceNodeMap.set(intf, node));
  });

  const inputGroups = new Map<ProcessNode, ResourceNode[]>();
  inputs.forEach((inputNode) => {
    const outputIntf = Object.values(inputNode.outputs || {})[0] as NodeInterface<unknown> | undefined;
    const connection = graph.connections.find((c) => c.from === outputIntf);
    const owner = connection ? interfaceNodeMap.get(connection.to) : mainProcess;
    const ownerProcess = (owner && owner.type === "ProcessNode") ? (owner as ProcessNode) : mainProcess;
    if (!ownerProcess) return;
    if (!inputGroups.has(ownerProcess)) inputGroups.set(ownerProcess, []);
    inputGroups.get(ownerProcess)?.push(inputNode);
  });

  const placeLeftOfProcess = (processNode: ProcessNode, items: ResourceNode[]) => {
    if (!items.length) return { bottom: processTop };
    const processRect = getNodeSize(processNode, { width: 200, height: 180 });
    const processX = processNode.position.x + processRect.width / 2;
    const processY = processNode.position.y + processRect.height / 2;
    const sizes = items.map((node) => getNodeSize(node, { width: 200, height: 120 }));
    const totalHeight = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, items.length - 1) * verticalGap;
    let currentY = processY - totalHeight / 2;
    let bottom = currentY;
    items.forEach((node, index) => {
      const size = sizes[index];
      const x = processX - processRect.width / 2 - offsetFromProcess - size.width;
      const y = currentY;
      setPos(node, x, y);
      currentY += size.height + verticalGap;
      bottom = y + size.height;
    });
    return { bottom };
  };

  let inputsBottom = -Infinity;
  inputGroups.forEach((group, ownerProcess) => {
    const result = placeLeftOfProcess(ownerProcess, group);
    inputsBottom = Math.max(inputsBottom, result.bottom);
  });

  const outputGroups = new Map<ProcessNode, ResourceNode[]>();
  outputs.forEach((outputNode) => {
    const inputIntf = Object.values(outputNode.inputs || {})[0] as NodeInterface<unknown> | undefined;
    const connection = graph.connections.find((c) => c.to === inputIntf);
    const owner = connection ? interfaceNodeMap.get(connection.from) : mainProcess;
    const ownerProcess = (owner && owner.type === "ProcessNode") ? (owner as ProcessNode) : mainProcess;
    if (!ownerProcess) return;
    if (!outputGroups.has(ownerProcess)) outputGroups.set(ownerProcess, []);
    outputGroups.get(ownerProcess)?.push(outputNode);
  });

  const placeRightOfProcess = (processNode: ProcessNode, items: ResourceNode[]) => {
    if (!items.length) return { maxRight: processRight, top: processTop, bottom: processTop };
    const processRect = getNodeSize(processNode, { width: 200, height: 180 });
    const processX = processNode.position.x + processRect.width / 2;
    const processY = processNode.position.y + processRect.height / 2;
    const sizes = items.map((node) => getNodeSize(node, { width: 200, height: 120 }));
    const totalHeight = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, items.length - 1) * verticalGap;
    let currentY = processY - totalHeight / 2;
    let maxRight = -Infinity;
    const top = currentY;
    let bottom = currentY;
    items.forEach((node, index) => {
      const size = sizes[index];
      const x = processX + processRect.width / 2 + offsetFromProcess;
      const y = currentY;
      setPos(node, x, y);
      maxRight = Math.max(maxRight, x + size.width);
      currentY += size.height + verticalGap;
      bottom = y + size.height;
    });
    return { maxRight, top, bottom };
  };

  let outputColumnRight = processRight;
  let outputsBottom = -Infinity;
  outputGroups.forEach((group, ownerProcess) => {
    const result = placeRightOfProcess(ownerProcess, group);
    outputColumnRight = Math.max(outputColumnRight, result.maxRight);
    outputsBottom = Math.max(outputsBottom, result.bottom);
  });

  const mechSizes = mechanisms.map((node) => getNodeSize(node, { width: 200, height: 120 }));
  const totalMechWidth = mechSizes.reduce((sum, size) => sum + size.width, 0) + Math.max(0, mechanisms.length - 1) * mechanismGap;
  let currentX = centerX - totalMechWidth / 2;
  const safeInputsBottom = Number.isFinite(inputsBottom) ? inputsBottom : processBottom;
  const safeOutputsBottom = Number.isFinite(outputsBottom) ? outputsBottom : inputsBottom;
  const bottomRowTarget = Math.max(safeInputsBottom, safeOutputsBottom) + 10;
  const bottomRowY = Math.max(processBottom + 20, bottomRowTarget);

  mechanisms.forEach((node, index) => {
    const size = mechSizes[index];
    const x = currentX;
    const y = bottomRowY;
    setPos(node, x, y);
    currentX += size.width + mechanismGap;
  });

  const secondaryProcesses = processNodes.filter((node) => node !== mainProcess);
  if (secondaryProcesses.length > 0) {
    const processColumnGap = 40;
    const columnCenterX = Math.max(outputColumnRight + 220, centerX + 520);
    const sizes = secondaryProcesses.map((node) => getNodeSize(node, { width: 200, height: 180 }));
    const totalHeight = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, sizes.length - 1) * processColumnGap;
    let currentY = centerY - totalHeight / 2 - 40;
    secondaryProcesses.forEach((node, index) => {
      const size = sizes[index];
      const x = columnCenterX - size.width / 2;
      const y = currentY;
      setPos(node, x, y);
      currentY += size.height + processColumnGap;
    });
  }

  if (debugEnabled) {
    console.groupEnd();
  }
  refreshConnectionCoords();
};

const handleAutoArrange = () => {
  autoArrangeNodes();
  refreshConnectionCoords();
};

let markerObserver: MutationObserver | null = null;

onMounted(() => {
  authToken.value = getStoredAuthToken();
  
  // Restore contact fields from localStorage
  restoreContactFields();
  
  initReownAppKit((token) => {
    authToken.value = token;
    if (!contactEmail.value.trim()) {
      const storedEmail = readStoredEmail();
      if (storedEmail) {
        contactEmail.value = storedEmail;
      }
    }
    if (pendingSave.value) {
      pendingSave.value = false;
      restoreDraftFromSession();
      setTimeout(() => {
        handleSaveFlow();
      }, 0);
    }
  }).catch((error) => console.error(error));

  const initialFlowId = parseFlowIdFromUrl();
  if (initialFlowId) {
    currentFlowId.value = initialFlowId;
  }

  const tryInstall = () => {
    if (installConnectionMarkers()) return;
    requestAnimationFrame(tryInstall);
  };

  tryInstall();
  let arrowUpdateTimer: number | null = null;
  markerObserver = new MutationObserver(() => {
    installConnectionMarkers();
    // Throttle arrow updates to avoid excessive DOM work
    if (arrowUpdateTimer) cancelAnimationFrame(arrowUpdateTimer);
    arrowUpdateTimer = requestAnimationFrame(() => updateConnectionArrows());
  });
  markerObserver.observe(document.body, { childList: true, subtree: true });

  const graph = baklava.displayedGraph;
  if (currentFlowId.value) {
    loadFlowById(currentFlowId.value).catch((error) => console.error(error));
    return;
  }
  if (restoreDraftFromSession()) {
    nextTick(() => refreshConnectionCoords());
    return;
  }
  if (graph.nodes.length > 0) {
    const wired = ensureDemoConnections();
    if (wired) {
      setTimeout(() => autoArrangeNodes(), 50);
    }
    nextTick(() => refreshConnectionCoords());
    return;
  }

  logGraphState("mounted-before");

  // Create demo: Manufacturing process with all resource types
  const input1 = graph.addNode(new ResourceNode("input"));
  const input2 = graph.addNode(new ResourceNode("input"));
  const machine = graph.addNode(new ResourceNode("machine"));
  const energy = graph.addNode(new ResourceNode("energy"));
  const gas = graph.addNode(new ResourceNode("gas"));
  const water = graph.addNode(new ResourceNode("water"));
  const service = graph.addNode(new ResourceNode("service"));
  const property = graph.addNode(new ResourceNode("property"));
  
  const manufacturingNode = graph.addNode(new ProcessNode());
  const wasteNode = graph.addNode(new ProcessNode());
  
  const output1 = graph.addNode(new ResourceNode("output"));
  const output2 = graph.addNode(new ResourceNode("output"));

  if (!manufacturingNode || !wasteNode || !input1 || !input2 || !machine || !energy || !gas || !water || !service || !property || !output1 || !output2) {
    return;
  }


  // Set titles
  (input1 as any).title = "Fő összetevő";
  (input2 as any).title = "Csomagolás";
  (machine as any).title = "Géphasználat";
  (energy as any).title = "Villany (kWh)";
  (gas as any).title = "Gáz (m3)";
  (water as any).title = "Víz (m3)";
  (service as any).title = "Szolgáltatás";
  (property as any).title = "Ingatlan";
  manufacturingNode.title = "Folyamat";
  wasteNode.title = "Hulladékkezelés";
  (output1 as any).title = "Főtermék";
  (output2 as any).title = "Melléktermék";

  // Connect resources to process node
  // Inputs to left side
  const input1Output = Object.values(input1.outputs)[0];
  const input2Output = Object.values(input2.outputs)[0];
  const processInput1 = findInputByField(manufacturingNode, "inputInstance.material");
  const processInput2 = findInputByField(manufacturingNode, "inputInstance.quantity");
  
  if (input1Output && processInput1) graph.addConnection(input1Output, processInput1);
  if (input2Output && processInput2) graph.addConnection(input2Output, processInput2);

  // Machine and Energy to bottom
  const machineOutput = Object.values(machine.outputs)[0];
  const energyOutput = Object.values(energy.outputs)[0];
  const processMachine = findInputByField(manufacturingNode, "machineInstance.category");
  const processEnergy = findInputByField(manufacturingNode, "machineInstance.quantity");
  const processGas = findInputByField(manufacturingNode, "serviceInstance.gas");
  const processWater = findInputByField(manufacturingNode, "serviceInstance.water");
  const processService = findInputByField(manufacturingNode, "serviceInstance.service");
  const processProperty = findInputByField(manufacturingNode, "serviceInstance.property");
  
  if (machineOutput && processMachine) graph.addConnection(machineOutput, processMachine);
  if (energyOutput && processEnergy) graph.addConnection(energyOutput, processEnergy);
  const gasOutput = Object.values(gas.outputs)[0];
  const waterOutput = Object.values(water.outputs)[0];
  const serviceOutput = Object.values(service.outputs)[0];
  const propertyOutput = Object.values(property.outputs)[0];

  if (gasOutput && processGas) graph.addConnection(gasOutput, processGas);
  if (waterOutput && processWater) graph.addConnection(waterOutput, processWater);
  if (serviceOutput && processService) graph.addConnection(serviceOutput, processService);
  if (propertyOutput && processProperty) graph.addConnection(propertyOutput, processProperty);

  // Outputs from right side
  const processOutput1 = findOutputByField(manufacturingNode, "output.mainProduct");
  const processOutput2 = findOutputByField(manufacturingNode, "output.byproduct");
  const output1Input = Object.values(output1.inputs)[0];
  const output2Input = Object.values(output2.inputs)[0];
  const output2Output = Object.values(output2.outputs)[0];
  const wasteInput = findInputByField(wasteNode, "inputInstance.material");
  
  if (processOutput1 && output1Input) graph.addConnection(processOutput1, output1Input);
  if (processOutput2 && output2Input) graph.addConnection(processOutput2, output2Input);
  if (output2Output && wasteInput) graph.addConnection(output2Output, wasteInput);

  // Auto-arrange after setup
  setTimeout(() => autoArrangeNodes(), 100);
  setTimeout(() => autoArrangeNodes(), 500);
  setTimeout(() => refreshConnectionCoords(), 200);
  setTimeout(() => logGraphState("mounted-after"), 600);
});

onUnmounted(() => {
  if (markerObserver) {
    markerObserver.disconnect();
    markerObserver = null;
  }
});

// Watch for changes and auto-arrange
watch(
  () => [baklava.displayedGraph.nodes.length, baklava.displayedGraph.connections.length],
  () => {
    if (suppressAutoArrange.value) return;
    logGraphState("watch-change");
    setTimeout(() => autoArrangeNodes(), 50);
    setTimeout(() => refreshConnectionCoords(), 100);
  }
);
</script>
<template>
  <div class="editor-shell">
    <div v-if="showInstructions" class="instructions-overlay">
      <div class="instructions-panel">
        <button class="close-btn" @click="showInstructions = false">✕</button>
        <h2>IDEF0 Process Flow Editor</h2>
        <div class="instruction-section">
          <h3>Getting Started</h3>
          <ul>
            <li>Drag nodes by their center title area</li>
            <li>Connect ports by dragging from one port to another</li>
            <li>Click "Auto-Arrange" button to organize layout</li>
          </ul>
        </div>
        <div class="instruction-section">
          <h3>Node Structure (IDEF0)</h3>
          <ul>
            <li><strong>Process Node:</strong> Central manufacturing step</li>
            <li><strong>Resource Nodes:</strong> Inputs, Outputs, Machines, Energy</li>
            <li><strong>Layout:</strong> Resources automatically position around processes</li>
          </ul>
        </div>
        <div class="instruction-section">
          <h3>Controls</h3>
          <ul>
            <li>Pan: Click and drag on empty canvas</li>
            <li>Zoom: Mouse wheel or pinch gesture</li>
            <li>Delete: Select node/connection and press Delete</li>
          </ul>
        </div>
        <button class="got-it-btn" @click="showInstructions = false">Got it!</button>
      </div>
    </div>

    <div class="save-toolbar">
      <button v-if="!showInstructions" class="help-btn" @click="showInstructions = true" title="Show instructions">?</button>
      <button class="save-btn" @click="handleSaveFlow" :disabled="isSaving" title="Save flow">
        {{ isSaving ? "Saving..." : "Save" }}
      </button>
      <input
        id="save-email"
        v-model="contactEmail"
        class="save-input"
        type="email"
        placeholder="Email"
        autocomplete="email"
        aria-label="Email address"
      />
      <input
        id="save-phone"
        v-model="contactPhone"
        class="save-input save-input--phone"
        type="tel"
        placeholder="Phone"
        autocomplete="tel"
        aria-label="Phone number"
      />
      <span v-if="saveStatus" class="save-status">{{ saveStatus }}</span>
    </div>
    <div v-if="saveError" class="save-error">{{ saveError }}</div>
    <button v-if="false" class="arrange-btn" @click="handleAutoArrange" title="Auto-arrange nodes">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
      Auto-Arrange
    </button>


    <BaklavaEditor :view-model="baklava">
      <template #node="{ node, selected, dragging, onStartDrag, onSelect }">
        <!-- Hide subgraph nodes completely -->
        <template v-if="node.type && (node.type.includes('Subgraph') || node.type.includes('__baklava'))">
          <div style="display: none;"></div>
        </template>
        <!-- Render custom Process nodes -->
        <template v-else-if="node instanceof ProcessNode || node.type === 'ProcessNode'">
          <Components.Node
            :node="node"
            :selected="selected"
            :dragging="dragging"
            :on-start-drag="onStartDrag"
            :on-select="(event?: any) => onSelect(event)"
          >
            <template #title></template>
            <template #nodeInterface></template>
            <template #content>
              <Idef0Node
                :node="node"
                :on-add-input="() => addInputPort(node as ProcessNode)"
                :on-add-output="() => addOutputPort(node as ProcessNode)"
                :on-add-mechanism="() => addMechanismPort(node as ProcessNode)"
                :on-delete="() => deleteNode(node as ProcessNode)"
              />
            </template>
          </Components.Node>
        </template>
        <!-- Render custom Resource nodes -->
        <template v-else-if="node instanceof ResourceNode || node.type === 'ResourceNode'">
          <Components.Node
            :node="node"
            :selected="selected"
            :dragging="dragging"
            :on-start-drag="onStartDrag"
            :on-select="(event?: any) => onSelect(event)"
          >
            <template #title></template>
            <template #nodeInterface></template>
            <template #content>
              <ResourceNodeVue
                :node="node"
                :on-delete="() => deleteNode(node as ResourceNode)"
                :on-output-connector="(intf) => addProcessFromOutput(node as ResourceNode, intf)"
              />
            </template>
          </Components.Node>
        </template>
        <!-- Fallback for any other node types (shouldn't happen) -->
        <template v-else>
          <Components.Node
            :node="node"
            :selected="selected"
            :dragging="dragging"
            :on-start-drag="onStartDrag"
            :on-select="(event?: any) => onSelect(event)"
          />
        </template>
      </template>
    </BaklavaEditor>

  </div>
</template>

<style>
/* Global styles to fix BaklavaJS node containers */
[data-node-type="ResourceNode"] {
  width: auto !important;
  max-width: 200px !important;
}
</style>

<style scoped>
.editor-shell {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.instructions-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.instructions-panel {
  background: #1e1e1e;
  color: #e0e0e0;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  position: relative;
}

.instructions-panel h2 {
  margin: 0 0 20px 0;
  font-size: 24px;
  color: #fff;
  text-align: center;
  border-bottom: 2px solid #444;
  padding-bottom: 12px;
}

.instructions-panel h3 {
  margin: 16px 0 8px 0;
  font-size: 16px;
  color: #4fc3f7;
}

.instruction-section {
  margin-bottom: 20px;
}

.instructions-panel ul {
  margin: 8px 0;
  padding-left: 20px;
  list-style: disc;
}

.instructions-panel li {
  margin: 6px 0;
  font-size: 14px;
  line-height: 1.5;
}

.instructions-panel strong {
  color: #fff;
  font-weight: 600;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: none;
  background: #444;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #666;
}

.got-it-btn {
  display: block;
  width: 100%;
  margin-top: 20px;
  padding: 12px;
  background: #4fc3f7;
  color: #000;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.got-it-btn:hover {
  background: #81d4fa;
}

.help-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  background: #4fc3f7;
  color: #000;
  border: 2px solid #000;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.help-btn:hover {
  background: #81d4fa;
  transform: scale(1.1);
}

.save-toolbar {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1000;
}

.save-btn {
  padding: 8px 14px;
  background: #4fc3f7;
  color: #000;
  border: 2px solid #000;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
}

.save-btn:hover {
  background: #81d4fa;
  transform: translateY(-1px);
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.save-status {
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border-radius: 10px;
  font-size: 12px;
}

.save-input {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #4a4a4a;
  background: #1f1f1f;
  color: #fff;
  font-size: 13px;
  min-width: 72px;
}

.save-input--phone {
  min-width: 43px;
}

.save-input:focus {
  outline: none;
  border-color: #4fc3f7;
}

.save-error {
  position: fixed;
  top: 56px;
  right: 16px;
  color: #ff8a80;
  font-size: 12px;
  z-index: 1000;
}


.arrange-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  padding: 10px 16px;
  background: #4fc3f7;
  color: #000;
  border: 2px solid #000;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.arrange-btn:hover {
  background: #81d4fa;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.arrange-btn:active {
  transform: translateY(0);
}

.arrange-btn svg {
  width: 18px;
  height: 18px;
}


@media (max-width: 768px) {
  .instructions-panel {
    max-width: 90vw;
    max-height: 85vh;
    padding: 20px;
  }

  .instructions-panel h2 {
    font-size: 20px;
  }

  .instructions-panel h3 {
    font-size: 14px;
  }

  .instructions-panel li {
    font-size: 13px;
  }

  .help-btn {
    width: 36px;
    height: 36px;
    font-size: 20px;
    top: 12px;
    right: 12px;
  }

  .save-btn {
    padding: 8px 12px;
    font-size: 12px;
  }

  .save-toolbar {
    top: 12px;
    right: 12px;
    flex-wrap: wrap;
  }

  .save-input {
    min-width: 60px;
  }

  .save-input--phone {
    min-width: 38px;
  }

  .save-error {
    top: 68px;
    right: 12px;
  }
}
</style>
