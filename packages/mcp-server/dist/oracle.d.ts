export interface OracleResult {
    nodeId: string;
    name: string;
    discipline: string;
    relevance: number;
    role: "supporting" | "challenging" | "process";
    question: string;
    stance: string;
}
export interface OracleResponse {
    synthesis: string;
    results: OracleResult[];
}
export declare function queryOracle(situation: string, apiKey: string): Promise<OracleResponse>;
//# sourceMappingURL=oracle.d.ts.map