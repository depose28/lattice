export declare const toolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            query: {
                type: string;
                description: string;
            };
            id?: undefined;
            discipline?: undefined;
            edge_type?: undefined;
            situation?: undefined;
            api_key?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            query?: undefined;
            discipline?: undefined;
            edge_type?: undefined;
            situation?: undefined;
            api_key?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            query?: undefined;
            id?: undefined;
            discipline?: undefined;
            edge_type?: undefined;
            situation?: undefined;
            api_key?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            discipline: {
                type: string;
                description: string;
            };
            query?: undefined;
            id?: undefined;
            edge_type?: undefined;
            situation?: undefined;
            api_key?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            id: {
                type: string;
                description: string;
            };
            edge_type: {
                type: string;
                description: string;
            };
            query?: undefined;
            discipline?: undefined;
            situation?: undefined;
            api_key?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            situation: {
                type: string;
                description: string;
            };
            api_key: {
                type: string;
                description: string;
            };
            query?: undefined;
            id?: undefined;
            discipline?: undefined;
            edge_type?: undefined;
        };
        required: string[];
    };
})[];
export declare function handleTool(name: string, args: Record<string, unknown>): Promise<string>;
//# sourceMappingURL=tools.d.ts.map