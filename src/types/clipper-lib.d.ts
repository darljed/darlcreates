/** The parts of clipper-lib (Angus Johnson's Clipper 6, JavaScript) that the clicker designer uses. */
declare module "clipper-lib" {
  export interface IntPoint { X: number; Y: number }
  export type Path = IntPoint[];
  export type Paths = Path[];
  export class PolyNode {
    Contour(): Path;
    Childs(): PolyNode[];
    IsHole(): boolean;
  }
  export class PolyTree extends PolyNode {}
  export class Clipper {
    constructor(initOptions?: number);
    AddPath(path: Path, polyType: number, closed: boolean): boolean;
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths | PolyTree, subjFillType?: number, clipFillType?: number): boolean;
    static ioReverseSolution: number;
    static ioStrictlySimple: number;
    static ioPreserveCollinear: number;
    static Area(path: Path): number;
    static Orientation(path: Path): boolean;
    static ReversePath(path: Path): void;
    static CleanPolygons(paths: Paths, distance: number): Paths;
    static SimplifyPolygons(paths: Paths, fillType: number): Paths;
  }
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Path, joinType: number, endType: number): void;
    AddPaths(paths: Paths, joinType: number, endType: number): void;
    Execute(solution: Paths | PolyTree, delta: number): void;
    Clear(): void;
  }
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
  export const PolyType: { ptSubject: number; ptClip: number };
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
  export const EndType: { etOpenSquare: number; etOpenRound: number; etOpenButt: number; etClosedLine: number; etClosedPolygon: number };
  const ClipperLib: {
    Clipper: typeof Clipper;
    ClipperOffset: typeof ClipperOffset;
    PolyTree: typeof PolyTree;
    ClipType: typeof ClipType;
    PolyType: typeof PolyType;
    PolyFillType: typeof PolyFillType;
    JoinType: typeof JoinType;
    EndType: typeof EndType;
  };
  export default ClipperLib;
}
