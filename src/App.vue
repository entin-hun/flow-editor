<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { DependencyEngine } from "@baklavajs/engine";
import { BaklavaEditor, Components, setNodePosition, useBaklava } from "@baklavajs/renderer-vue";
import type { NodeInterface } from "@baklavajs/core";
import Idef0Node from "./components/Idef0Node.vue";
import ResourceNodeVue from "./components/ResourceNode.vue";
import { ProcessNode } from "./nodes/ProcessNode";
import { ResourceNode } from "./nodes/ResourceNode";

const baklava = useBaklava();
const showInstructions = ref(false); // Start with instructions hidden
const debugEnabled = false;

// Configure editor options - disable sidebar, toolbar, and palette
baklava.settings.sidebar.enabled = false;
baklava.settings.sidebar.resizable = false;
baklava.settings.toolbar.enabled = false; // Disable toolbar with subgraph commands
baklava.settings.palette.enabled = false; // Disable node palette

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
  const svg = document.querySelector(".connections-container svg") as SVGSVGElement | null;
  if (!svg) return false;

  const existing = svg.querySelector("#connection-arrow") as SVGMarkerElement | null;
  if (existing) return true;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "connection-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "8");
  marker.setAttribute("markerUnits", "strokeWidth");
  marker.setAttribute("orient", "auto");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", "currentColor");

  marker.appendChild(path);
  defs.appendChild(marker);
  svg.prepend(defs);
  return true;
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

  const mainProcess = processNodes.find((node) => node.title === "Process") || processNodes[0];
  const wasteProcess = processNodes.find((node) => node.title === "Hulladékkezelés");

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

  if (wasteProcess) {
    const size = getNodeSize(wasteProcess, { width: 200, height: 180 });
    const x = Math.max(outputColumnRight + 220, centerX + 520) - size.width / 2;
    const y = centerY - size.height / 2 - 40;
    setPos(wasteProcess, x, y);
  }

  if (debugEnabled) {
    console.groupEnd();
  }
};

const handleAutoArrange = () => {
  autoArrangeNodes();
  refreshConnectionCoords();
};

let markerObserver: MutationObserver | null = null;

onMounted(() => {
  const tryInstall = () => {
    if (installConnectionMarkers()) return;
    requestAnimationFrame(tryInstall);
  };

  tryInstall();
  markerObserver = new MutationObserver(() => installConnectionMarkers());
  markerObserver.observe(document.body, { childList: true, subtree: true });

  const graph = baklava.displayedGraph;
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
  (input1 as any).title = "Steel Sheet";
  (input2 as any).title = "Paint";
  (machine as any).title = "Machine";
  (energy as any).title = "Electricity";
  (gas as any).title = "Gáz (m3)";
  (water as any).title = "Víz (m3)";
  (service as any).title = "Szolgáltatás";
  (property as any).title = "Ingatlan";
  manufacturingNode.title = "Process";
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

    <button v-else class="help-btn" @click="showInstructions = true" title="Show instructions">?</button>
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
              <ResourceNodeVue :node="node" :on-delete="() => deleteNode(node as ResourceNode)" />
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
  position: fixed;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #4fc3f7;
  color: #000;
  border: 2px solid #000;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.help-btn:hover {
  background: #81d4fa;
  transform: scale(1.1);
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
}
</style>
