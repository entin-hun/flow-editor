import { Node, NodeInterface } from "@baklavajs/core";

type Location = "left" | "right" | "top" | "bottom";

type ResourceType = "input" | "output" | "machine" | "energy" | "gas" | "water" | "service" | "property";

type ResourceFields = {
  origin?: string;
  inputQuantity?: number;
  details?: string;
  outputKg?: number;
  destination?: string;
  quantity?: number;
  duration?: string;
  parameters?: string;
};

export class ResourceNode extends Node<Record<string, unknown>, Record<string, unknown>> {
  public readonly type = "ResourceNode";
  public resourceType: ResourceType;
  public inputs: Record<string, NodeInterface<unknown>> = {};
  public outputs: Record<string, NodeInterface<unknown>> = {};
  public fields: ResourceFields = {};
  
  public constructor(resourceType: ResourceType = "input") {
    super();
    this.resourceType = resourceType;
    (this as any).width = 200;
    (this as any).twoColumn = false;
    
    this.initInterfaces(resourceType);
  }

  private initInterfaces(resourceType: ResourceType) {
    switch (resourceType) {
      case "input":
        this.title = "Input Material";
        this.fields = { origin: "", inputQuantity: 0, details: "" };
        this.addResourceOutput("Material", "right");
        break;
      case "output":
        this.title = "Output Product";
        this.fields = { outputKg: 1, destination: "" };
        this.addResourceInput("Product");
        this.addResourceOutput("Output", "right");
        break;
      case "machine":
        this.title = "Machine";
        this.fields = { duration: "", parameters: "" };
        this.addResourceOutput("Machine Slot", "top");
        break;
      case "energy":
        this.title = "Energy Source";
        this.fields = { quantity: 0 };
        this.addResourceOutput("Energy", "top");
        break;
      case "gas":
        this.title = "Gáz (m3)";
        this.fields = { quantity: 0 };
        this.addResourceOutput("Gas", "top");
        break;
      case "water":
        this.title = "Víz (m3)";
        this.fields = { quantity: 0 };
        this.addResourceOutput("Water", "top");
        break;
      case "service":
        this.title = "Szolgáltatás";
        this.fields = { duration: "", parameters: "" };
        this.addResourceOutput("Service", "top");
        break;
      case "property":
        this.title = "Ingatlan";
        this.fields = { duration: "", parameters: "" };
        this.addResourceOutput("Property", "top");
        break;
    }
  }

  public save() {
    return {
      ...super.save(),
      resourceType: this.resourceType,
      fields: this.fields,
    };
  }

  public load(state: ReturnType<ResourceNode["save"]> & Record<string, unknown>) {
    // If resourceType differs from default, rebuild interfaces to match saved state
    const savedType = (state as any).resourceType as ResourceType | undefined;
    if (savedType && savedType !== this.resourceType) {
      // Clear constructor-created interfaces directly (safe: node not in graph yet)
      this.inputs = {};
      this.outputs = {};
      this.resourceType = savedType;
      this.initInterfaces(savedType);
    }
    super.load(state);
    if ((state as any).fields) this.fields = (state as any).fields;
  }
  
  private addResourceOutput(name: string, location: Location = "right"): NodeInterface<unknown> {
    const intf = new NodeInterface<unknown>(name, null).setPort(true).setHidden(false);
    (intf as any).data = { location };
    this.addOutput(name.toLowerCase().replace(/\s+/g, "_"), intf);
    return intf;
  }
  
  private addResourceInput(name: string): NodeInterface<unknown> {
    const intf = new NodeInterface<unknown>(name, null).setPort(true).setHidden(false);
    (intf as any).data = { location: "left" as Location };
    this.addInput(name.toLowerCase().replace(/\s+/g, "_"), intf);
    return intf;
  }
}
