import { Node, NodeInterface } from "@baklavajs/core";

type FlowSide = "input" | "output" | "knowHow" | "service";
type Location = "left" | "right" | "top" | "bottom";

type ProcessFieldPath =
  | "inputInstance.material"
  | "inputInstance.quantity"
  | "output.mainProduct"
  | "output.byproduct"
  | "impact.carbon"
  | "impact.water"
  | "impact.landUse"
  | "knowHow.owner"
  | "knowHow.hash"
  | "knowHow.inputs"
  | "knowHow.outputs"
  | "knowHow.licenseFee"
  | "knowHow.note"
  | "knowHow.logoURL"
  | "machineInstance.category"
  | "machineInstance.ownerId"
  | "machineInstance.quantity"
  | "machineInstance.size"
  | "machineInstance.providerSDomain"
  | "machineInstance.hr.tasks"
  | "machineInstance.hr.assignee"
  | "serviceInstance.gas"
  | "serviceInstance.water"
  | "serviceInstance.service"
  | "serviceInstance.property";

type PortMeta = {
  side: FlowSide;
  location: Location;
  flowType: string;
  fieldPath?: ProcessFieldPath;
};

type PortIntf = NodeInterface<unknown> & { data?: PortMeta };

const inputSideToLocation: Record<Exclude<FlowSide, "output">, Location> = {
  input: "left",
  knowHow: "top",
  service: "bottom",
};

const outputSideToLocation: Record<FlowSide, Location> = {
  input: "left",
  output: "right",
  knowHow: "top",
  service: "bottom",
};

export class ProcessNode extends Node<Record<string, unknown>, Record<string, unknown>> {
  public readonly type = "ProcessNode";
  public inputs: Record<string, NodeInterface<unknown>> = {};
  public outputs: Record<string, NodeInterface<unknown>> = {};
  public details = "";

  public constructor() {
    super();
    this.title = "Manufacturing Step";
    (this as any).width = 200;
    (this as any).twoColumn = false;

    // Left side - 2 input ports
    this.addFlowInterface("Input 1", "material", "input", "inputInstance.material");
    this.addFlowInterface("Input 2", "material", "input", "inputInstance.quantity");

    // Bottom side - 2 mechanism ports (Machine + Energy)
    this.addFlowInterface("Machine", "service", "service", "machineInstance.category");
    this.addFlowInterface("Energy", "service", "service", "machineInstance.quantity");
    this.addFlowInterface("Gáz (m3)", "service", "service", "serviceInstance.gas");
    this.addFlowInterface("Víz (m3)", "service", "service", "serviceInstance.water");
    this.addFlowInterface("Szolgáltatás", "service", "service", "serviceInstance.service");
    this.addFlowInterface("Ingatlan", "service", "service", "serviceInstance.property");

    // Right side - 2 output ports
    this.addFlowInterface("Output 1", "product", "output", "output.mainProduct");
    this.addFlowInterface("Output 2", "product", "output", "output.byproduct");
  }

  public addFlowInterface(name: string, flowType: string, side: FlowSide, fieldPath?: ProcessFieldPath): NodeInterface<unknown> {
    const key = this.makeKey(name, side, flowType, fieldPath);
    const intf = new NodeInterface<unknown>(name, null).setPort(true).setHidden(false) as PortIntf;
    intf.data = {
      side,
      location: outputSideToLocation[side],
      flowType,
      fieldPath,
    };

    if (side === "output" || side === "knowHow") {
      this.addOutput(key, intf);
      return intf;
    }

    const location = inputSideToLocation[side];
    intf.data.location = location;
    this.addInput(key, intf);
    return intf;
  }

  public makeKey(name: string, side: FlowSide, flowType: string, fieldPath?: ProcessFieldPath): string {
    const source = fieldPath ?? `${side}_${flowType}_${name}`;
    const normalized = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const ioCollection = side === "output" || side === "knowHow" ? this.outputs : this.inputs;
    let key = normalized;
    let index = 1;
    while (Object.prototype.hasOwnProperty.call(ioCollection, key)) {
      key = `${normalized}_${index}`;
      index += 1;
    }
    return key;
  }

  public save() {
    // Save port metadata alongside standard BaklavaJS state
    const portMeta: Record<string, { side: FlowSide; flowType: string; fieldPath?: string }> = {};
    const allIntfs: Record<string, PortIntf> = { ...this.inputs, ...this.outputs };
    for (const [key, intf] of Object.entries(allIntfs)) {
      if ((intf as PortIntf).data) {
        portMeta[key] = {
          side: (intf as PortIntf).data!.side,
          flowType: (intf as PortIntf).data!.flowType,
          fieldPath: (intf as PortIntf).data!.fieldPath,
        };
      }
    }
    return {
      ...super.save(),
      details: this.details,
      portMeta,
    };
  }

  public load(state: ReturnType<ProcessNode["save"]> & Record<string, unknown>) {
    const portMeta = (state as any).portMeta as Record<string, { side: FlowSide; flowType: string; fieldPath?: string }> | undefined;

    // Create any dynamically-added interfaces that exist in saved state
    // but don't exist after the constructor ran
    const savedInputs = (state as any).inputs || {};
    const savedOutputs = (state as any).outputs || {};

    for (const key of Object.keys(savedInputs)) {
      if (!this.inputs[key]) {
        const meta = portMeta?.[key];
        const side: FlowSide = meta?.side ?? "input";
        const flowType = meta?.flowType ?? "material";
        const location: Location = meta?.location as Location ?? inputSideToLocation[side as Exclude<FlowSide, "output">] ?? "left";
        const fieldPath = meta?.fieldPath as ProcessFieldPath | undefined;

        const intf = new NodeInterface<unknown>(key, null).setPort(true).setHidden(false) as PortIntf;
        intf.data = { side, location, flowType, fieldPath };
        this.addInput(key, intf);
      } else if (portMeta?.[key]) {
        // Restore port metadata for constructor-created interfaces
        const existing = this.inputs[key] as PortIntf;
        if (!existing.data) {
          existing.data = {
            side: portMeta[key].side,
            location: inputSideToLocation[portMeta[key].side as Exclude<FlowSide, "output">],
            flowType: portMeta[key].flowType,
            fieldPath: portMeta[key].fieldPath as ProcessFieldPath | undefined,
          };
        }
      }
    }

    for (const key of Object.keys(savedOutputs)) {
      if (!this.outputs[key]) {
        const meta = portMeta?.[key];
        const side: FlowSide = meta?.side ?? "output";
        const flowType = meta?.flowType ?? "product";
        const location: Location = meta?.location as Location ?? outputSideToLocation[side] ?? "right";
        const fieldPath = meta?.fieldPath as ProcessFieldPath | undefined;

        const intf = new NodeInterface<unknown>(key, null).setPort(true).setHidden(false) as PortIntf;
        intf.data = { side, location, flowType, fieldPath };
        this.addOutput(key, intf);
      } else if (portMeta?.[key]) {
        const existing = this.outputs[key] as PortIntf;
        if (!existing.data) {
          existing.data = {
            side: portMeta[key].side,
            location: outputSideToLocation[portMeta[key].side],
            flowType: portMeta[key].flowType,
            fieldPath: portMeta[key].fieldPath as ProcessFieldPath | undefined,
          };
        }
      }
    }

    super.load(state);
    if ((state as any).details !== undefined) this.details = (state as any).details;
  }
}