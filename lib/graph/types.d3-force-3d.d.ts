declare module "d3-force-3d" {
  interface SimulationNode {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  interface SimulationLink<N extends SimulationNode = SimulationNode> {
    source: N | string | number;
    target: N | string | number;
    index?: number;
  }

  interface Simulation<N extends SimulationNode = SimulationNode> {
    tick(iterations?: number): this;
    nodes(): N[];
    nodes(nodes: N[]): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(): number;
    alphaMin(min: number): this;
    alphaDecay(): number;
    alphaDecay(decay: number): this;
    alphaTarget(): number;
    alphaTarget(target: number): this;
    velocityDecay(): number;
    velocityDecay(decay: number): this;
    force(name: string): Force<N> | undefined;
    force(name: string, force: Force<N> | null): this;
    stop(): this;
    numDimensions(): number;
    numDimensions(dims: 1 | 2 | 3): this;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Force<N extends SimulationNode = SimulationNode> {}

  interface CenterForce<N extends SimulationNode = SimulationNode> extends Force<N> {
    x(): number;
    x(x: number): this;
    y(): number;
    y(y: number): this;
    z(): number;
    z(z: number): this;
  }

  interface ManyBodyForce<N extends SimulationNode = SimulationNode> extends Force<N> {
    strength(): number;
    strength(strength: number | ((node: N, i: number, nodes: N[]) => number)): this;
    distanceMin(): number;
    distanceMin(distance: number): this;
    distanceMax(): number;
    distanceMax(distance: number): this;
    theta(): number;
    theta(theta: number): this;
  }

  interface LinkForce<N extends SimulationNode = SimulationNode> extends Force<N> {
    links(): SimulationLink<N>[];
    links(links: SimulationLink<N>[]): this;
    id(): (node: N, i: number, nodes: N[]) => string | number;
    id(id: (node: N, i: number, nodes: N[]) => string | number): this;
    distance(): number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    distance(distance: number | ((link: any, i: number, links: any[]) => number)): this;
    strength(): number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    strength(strength: number | ((link: any, i: number, links: any[]) => number)): this;
  }

  interface CollideForce<N extends SimulationNode = SimulationNode> extends Force<N> {
    radius(): number;
    radius(radius: number | ((node: N, i: number, nodes: N[]) => number)): this;
    strength(): number;
    strength(strength: number): this;
    iterations(): number;
    iterations(iterations: number): this;
  }

  export function forceSimulation<N extends SimulationNode = SimulationNode>(nodes?: N[], numDimensions?: 1 | 2 | 3): Simulation<N>;
  export function forceCenter<N extends SimulationNode = SimulationNode>(x?: number, y?: number, z?: number): CenterForce<N>;
  export function forceManyBody<N extends SimulationNode = SimulationNode>(): ManyBodyForce<N>;
  export function forceLink<N extends SimulationNode = SimulationNode>(links?: SimulationLink<N>[]): LinkForce<N>;
  export function forceCollide<N extends SimulationNode = SimulationNode>(radius?: number): CollideForce<N>;
  export function forceX<N extends SimulationNode = SimulationNode>(x?: number): Force<N>;
  export function forceY<N extends SimulationNode = SimulationNode>(y?: number): Force<N>;
  export function forceZ<N extends SimulationNode = SimulationNode>(z?: number): Force<N>;
  export function forceRadial<N extends SimulationNode = SimulationNode>(radius?: number, x?: number, y?: number, z?: number): Force<N>;
}
