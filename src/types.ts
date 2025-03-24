import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";

export interface SessionContext {
    sessionId: string;
    accessToken: string;
    expired: number;
    transport: SSEServerTransport;
}

export interface Field {
    name: string;
    type: string;
    unique: boolean;
    primaryKey: boolean;
}

export interface Index {
    name: string;
    keys: string[];
}

export interface Schema {
    id: string;
    type: string
    name: string
}

export interface ConnectionSchema extends Schema {
    databaseType: string
    connectionType?: string
    tableCount?: number
    tables?: []
}

export interface TableSchema extends Schema {
    fields?: Field[]
    indexes?: Index[]
}