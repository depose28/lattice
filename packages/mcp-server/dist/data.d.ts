export interface Node {
    id: string;
    name: string;
    discipline: string;
    chapter: string;
    degree: number;
    summary: string;
}
export interface Edge {
    source: string;
    target: string;
    type: string;
    strength: number;
    label: string;
}
export declare const EDGE_TYPES: readonly ["complementary", "structural_kinship", "tensioning", "prerequisite", "inversion", "cross_discipline_tfidf", "same_discipline_tfidf", "same_chapter"];
export type EdgeType = (typeof EDGE_TYPES)[number];
export declare function searchModels(query: string, limit?: number): Node[];
export declare function getModel(id: string): Node | undefined;
export declare function getConnections(id: string): Array<{
    neighbor: Node;
    edgeType: string;
    strength: number;
}>;
export declare function listDisciplines(): Array<{
    discipline: string;
    count: number;
}>;
export declare function getModelsByDiscipline(discipline: string): Node[];
export declare function findRelated(id: string, edgeType?: string): Array<{
    neighbor: Node;
    edgeType: string;
    strength: number;
}>;
export declare function getAllNodes(): Node[];
//# sourceMappingURL=data.d.ts.map