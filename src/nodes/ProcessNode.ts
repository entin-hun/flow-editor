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

  private makeKey(name: string, side: FlowSide, flowType: string, fieldPath?: ProcessFieldPath): string {
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
}
