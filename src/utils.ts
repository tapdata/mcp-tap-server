import {Request} from 'express';
import {ConnectionSchema, Field, Index, TableSchema} from "./types.js";
import {ObjectId} from "mongodb";

function parseAuthorization(req: Request): { type: string; credentials: string } | null {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return null;
    }
    const [type, credentials] = authHeader.split(' ');
    if (!type || !credentials) {
        return null;
    }
    return {type, credentials};
}

function parseAccessCode(req: Request): { accessCode: string | undefined } | undefined {
    const accessCode = req.query['accessCode'];
    return {accessCode: accessCode as string};
}

export const getAuthorizationCredentials = (req: Request): string | undefined => {
    const auth = parseAuthorization(req);
    if (auth?.type === 'Bearer') {
        return auth.credentials
    }
    const data = parseAccessCode(req);
    if (data?.accessCode)
        return data.accessCode;
    return undefined
}

export const readConnectionSchema = (connection: { [key: string]: any }): ConnectionSchema => {
    return {
        id: connection.id,
        type: 'connection',
        name: connection.name,
        databaseType: connection.databaseType,
        connectionType: connection.connectionType,
        tableCount: connection.tableCount,
        tables: connection.schema?.tables?.map((table: { [key: string]: any }) => readTableSchema(table))
    } as ConnectionSchema
}

export const readTableSchema = (table: { [key: string]: any }): TableSchema => {
    const schema: TableSchema = {
        id: table.tableId,
        type: 'table',
        name: table?.table_name || 'Unknown table name',
        fields: [],
        indexes: []
    }

    table?.fields?.forEach((field: { [key: string]: any }) => {
        schema.fields?.push({
            name: field.field_name,
            type: field.data_type,
            unique: !!field.unique,
            primaryKey: !!field.primaryKey
        } as Field);
    })
    table?.indices?.forEach((index: { [key: string]: any }) => {
        schema.indexes?.push({
            name: index.indexName,
            unique: !!index.unique,
            keys: index.columns.map((c: { [key: string]: any }) => {
                return (table.fields[c.columnPosition] || {}).field_name
            }).filter((c: string) => !!c)
        } as Index)
    })
    return schema;
}

export const converObjectIdInFilter = (filter: { [key: string]: any }): any => {
    if (filter) {
        Object.keys(filter).forEach((key: string) => {
            if (key === '_id' && /[a-z0-9]{24}/.test(filter[key])) {
                filter[key] = new ObjectId(filter[key])
            }
        })
    }
    return filter
}