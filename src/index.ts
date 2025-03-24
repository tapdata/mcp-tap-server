import express from 'express';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import {
    PingRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,

    ListToolsRequestSchema,
    CallToolRequestSchema,

    ListPromptsRequestSchema,
    GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import session from 'express-session';
import {ConnectionSchema, Field, Index, Schema, SessionContext, TableSchema} from "./types.js";
import {getAuthorizationCredentials, readConnectionSchema, readTableSchema} from "./utils.js";
import {getConnectionById, health, listConnections, login, queryDataFromTable} from "./tm.js";

const mcpServer = new McpServer({
    name: 'mcp-tap-server',
    version: '1.0.0',
    description: "This is an MCP-Server adapter provided by TapData for use with LLM's."
}, {
    capabilities: {
        resources: {},
        tools: {},
        prompts: {},
    }
});
const sessionContextStore: { [key: string]: SessionContext } = {};

mcpServer.server.setRequestHandler(PingRequestSchema, async function (request, handlerExtra) {
    const sessionContext = sessionContextStore[handlerExtra?.sessionId || '']
    const tmStatus = await health(sessionContext.accessToken)
    if (tmStatus) {
        return {}
    }
    throw new Error('TM is not health.')
})

mcpServer.server.setRequestHandler(ListResourcesRequestSchema, async function (req, handlerExtra) {
    const sessionContext = sessionContextStore[handlerExtra?.sessionId || '']
    const connections = await listConnections(sessionContext.accessToken)
    const resources: any[] = []
    if (connections) {
        connections.forEach((c: { [key: string]: any }) => {
            resources.push({
                uri: `tap://${c.id}`,
                name: c.name,
                mimeType: "application/json",
                description: `The datasource type of connection "${c.name}" is ${c.databaseType}, which has a total of ${c.tableCount} tables`
            })
            if (c.schema?.tables?.length > 0) {
                c.schema.tables.forEach((table: { [key: string]: any }) => {
                    resources.push({
                        uri: `tap://${c.id}/${table.tableId}`,
                        name: `${c.name}/${table.table_name}`,
                        mimeType: "application/json",
                        description: `This is a table in datasource of connection "${c.name}", it has ${table.fields.length} fields`
                    })
                })
            }
        })
    }
    return {
        resources: resources
    }
})

mcpServer.server.setRequestHandler(ReadResourceRequestSchema, async function (req, handlerExtra) {
    const sessionContext = sessionContextStore[handlerExtra?.sessionId || '']

    const resourceUri = req.params.uri

    const regex = /tap:\/\/([a-zA-Z0-9]+)(\/([a-zA-Z0-9]+))?/;
    const match = resourceUri.match(regex);
    let connectionId = null;
    let tableId = null;
    if (match) {
        connectionId = match[1];
        tableId = match[3];
    }

    let schema: Schema = {
        id: '',
        type: 'Unknown',
        name: 'Unknown resource'
    }
    const connection = connectionId ? await getConnectionById(connectionId, sessionContext.accessToken) : {}
    if (connectionId && !tableId) {
        schema = readConnectionSchema(connection)
    } else if (connectionId && tableId) {
        const tables = connection.schema?.tables
        const table = tables.filter((t: { [key: string]: any }) => t.tableId === tableId)[0] || {}
        schema = readTableSchema(table)
    }

    return {
        contents: [
            {
                uri: resourceUri,
                mimeType: 'application/json',
                text: JSON.stringify(schema, null, 2)
            }
        ]
    }
})

mcpServer.server.setRequestHandler(ListResourceTemplatesRequestSchema, async function (request, handlerExtra) {
    return {
        resourceTemplates: [
            {
                name: 'connectionId',
                description: 'TapData datasource connection id',
                uriTemplate: 'tap://{connectionId}',
                text: ``
            },
            {
                name: 'tableId',
                description: 'Data table id in datasource',
                uriTemplate: 'tap://{connectionId}/{tableId}',
                text: ``
            }
        ]
    }
})

mcpServer.server.setRequestHandler(ListToolsRequestSchema, async function (req, handlerExtra) {
    return {
        tools: [
            {
                name: 'connections',
                description: 'List all available database connections',
                inputSchema: {
                    type: 'object'
                }
            },
            {
                name: 'tables',
                description: 'List all tables based on database connection id',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionId: {
                            type: "string",
                            description: "The id of the connection to list tables",
                        }
                    },
                    required: ['connectionId'],
                }
            },
            {
                name: 'query',
                description: 'Query data using the specified database connection id and table name',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionId: {
                            type: "string",
                            description: "The id of the connection to query data",
                        },
                        tableName: {
                            type: "string",
                            description: "The name of the table to query data",
                        }
                    },
                    required: ['connectionId', 'tableName'],
                }
            }
        ]
    }
})

mcpServer.server.setRequestHandler(CallToolRequestSchema, async function (req, handlerExtra) {

    const sessionContext = sessionContextStore[handlerExtra?.sessionId || '']

    const command = req.params.name
    const {connectionId, tableName} = req.params.arguments || {};

    let resultData = []
    switch (command) {
        case 'query': {
            if (!connectionId)
                throw new Error('Connection id is required')
            if (!tableName)
                throw new Error('Table name is required')

            resultData = await queryDataFromTable(connectionId as string, tableName as string, sessionContext.accessToken)
            break;
        }
        case 'connections': {
            const connections = await listConnections(sessionContext.accessToken)
            resultData = connections?.map((c: any) => readConnectionSchema(c))?.map((c: ConnectionSchema) => {
                delete c?.tables
                return c;
            })
            break;
        }
        case 'tables': {
            if (!connectionId)
                throw new Error('Connection id is required')

            const connection = connectionId ? await getConnectionById(connectionId as string, sessionContext.accessToken) : {}
            resultData = connection.schema?.tables?.map((table: {
                [key: string]: any
            }) => readTableSchema(table))?.map((t: TableSchema) => {
                delete t.fields
                delete t.indexes
                return t
            })
            break;
        }
    }
    return {content: [{type: 'text', text: JSON.stringify(resultData, null, 2)}]};
})

mcpServer.server.setRequestHandler(ListPromptsRequestSchema, async function (req, handlerExtra) {
    return {
        prompts: [
            {
                name: 'analyze_table',
                description: 'Analyze a table structure and contents',
                arguments: [
                    {
                        name: "connectionId",
                        description: "Connection id of the datasource to analyze",
                        required: true,
                    },
                    {
                        name: "tableId",
                        description: "Table id of the connection to analyze",
                        required: true,
                    },
                ],
            }
        ]
    }
})

mcpServer.server.setRequestHandler(GetPromptRequestSchema, async function (req, handlerExtra) {
    if (req.params.name !== "analyze_table") {
        throw new Error("Unknown prompt");
    }
    const connectionId = req.params.arguments?.connectionId;
    if (!connectionId) {
        throw new Error("Datasource connection id is required");
    }
    const tableId = req.params.arguments?.tableId;
    if (!tableId) {
        throw new Error("Table id is required");
    }

    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Please analyze the following table:
Table name: ${tableId}

Schema: 

Stats:

Sample documents:`
                }
            },
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Provide insights about the table's structure, data types, and basic statistics.`
                }
            }
        ]
    }
})

const app = express()
app.use(session({
    name: 'sid',
    secret: 'YUVmYXhGM1Rldw==',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: true
    }
}))
app.use(function (req, res, next) {
    const {method, path} = req
    const startTime = Date.now()
    res.on('close', () => {
        console.log(`[${new Date().toLocaleString()}] ${method} ${path} ${Date.now() - startTime}ms`)
    })
    next()
})

app.get('/sse', async (req, res) => {

    try {
        const accessCode = getAuthorizationCredentials(req)
        if (!accessCode) {
            console.log(`[${new Date().toLocaleString()}] No access code found in the request header, you need to provide an access code using http basic, like 'authorization: Bearer xxx'`)
            res.status(401).send('Not authorized');
            return;
        }

        const userToken = await login(accessCode)
        if (!userToken) {
            console.log(`[${new Date().toLocaleString()}] The access code you provided is invalid`)
            res.status(401).send('Not authorized');
            return;
        }

        const transport = new SSEServerTransport("/messages", res);
        sessionContextStore[transport.sessionId] = {
            sessionId: transport.sessionId,
            accessToken: userToken.id,
            expired: Date.now() + userToken.ttl * 1000,
            transport: transport
        };
        res.on('close', () => {
            delete sessionContextStore[transport.sessionId];
        })
        await mcpServer.connect(transport);
    } catch (e) {
        console.error('process /sse failed', e);
        res.status(500).send('Server Error: ' + e);
    }
})

app.post('/messages', async (req, res) => {
    try {
        const transportSessionId = req.query.sessionId;
        if (typeof transportSessionId === 'string') {
            const sessionContext = sessionContextStore[transportSessionId];
            if (sessionContext)
                await sessionContext.transport.handlePostMessage(req, res);
            else {
                res.status(200).json({
                    code: 'NotFoundTransport',
                    message: 'Not connect before sending message'
                });
            }
        } else {
            res.status(200).json({
                code: 'InvalidRequest',
                message: 'Required parameter sessionId'
            });
        }
    } catch (e) {
        console.error('process /messages failed', e);
        res.status(500).send('Server Error: ' + e);
    }
})

app.get('/health', async (req, res) => {
    res.json({
        transport: Object.keys(sessionContextStore)
    })
})

app.listen(3001, (error) => {
    if (error) {
        console.error('MCP server start failed with error ', error);
    } else {
        console.log('MCP server started on port 3001');
    }
});
