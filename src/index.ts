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
import {ConnectionSchema, Schema, SessionContext, TableSchema} from "./types.js";
import {converObjectIdInFilter, getAuthorizationCredentials, readConnectionSchema, readTableSchema} from "./utils.js";
import {getConnectionById, health, listConnections, login, queryDataFromTable} from "./tm.js";
import {closeDB, getDB} from "./db.js";
import {CollationOptions, CountDocumentsOptions, FindOptions, ReadConcernLike} from "mongodb";

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
    const connections = await listConnections(sessionContext.accessToken, sessionContext.tags)
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
                name: 'listConnections',
                description: 'List all available database connections',
                inputSchema: {
                    type: 'object'
                }
            },
            {
                name: "listCollections",
                description: "List all collections in the MongoDB database",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: {
                            type: "string",
                            description: "The id of the connection to query data",
                        },
                        nameOnly: {
                            type: "boolean",
                            description:
                                "Optional: If true, returns only the collection names instead of full collection info",
                        },
                        filter: {
                            type: "object",
                            description: "Optional: Filter to apply to the collections",
                        },
                    },
                    required: ["connectionId"]
                },
            },
            {
                name: "query",
                description:
                    "Execute a MongoDB query with optional execution plan analysis",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: {
                            type: "string",
                            description: "The id of the connection to query data",
                        },
                        collectionName: {
                            type: "string",
                            description: "Name of the collection to query",
                        },
                        filter: {
                            type: "object",
                            description: "MongoDB query filter",
                        },
                        projection: {
                            type: "object",
                            description: "Fields to include/exclude",
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of documents to return",
                        },
                        explain: {
                            type: "string",
                            description:
                                "Optional: Get query execution information (queryPlanner, executionStats, or allPlansExecution)",
                            enum: ["queryPlanner", "executionStats", "allPlansExecution"],
                        },
                    },
                    required: ["connectionId", "collectionName"],
                },
            },
            {
                name: "aggregate",
                description:
                    "Execute a MongoDB aggregation pipeline with optional execution plan analysis",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: {
                            type: "string",
                            description: "The id of the connection to query data",
                        },
                        collectionName: {
                            type: "string",
                            description: "Name of the collection to aggregate",
                        },
                        pipeline: {
                            type: "array",
                            description: "Aggregation pipeline stages",
                        },
                        explain: {
                            type: "string",
                            description:
                                "Optional: Get aggregation execution information (queryPlanner, executionStats, or allPlansExecution)",
                            enum: ["queryPlanner", "executionStats", "allPlansExecution"],
                        },
                    },
                    required: ["connectionId", "collectionName", "pipeline"],
                },
            },
            {
                name: "count",
                description:
                    "Count the number of documents in a collection that match a query",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: {
                            type: "string",
                            description: "The id of the connection to query data",
                        },
                        collectionName: {
                            type: "string",
                            description: "Name of the collection to count documents in",
                        },
                        query: {
                            type: "object",
                            description:
                                "Optional: Query filter to select documents to count",
                        },
                        limit: {
                            type: "integer",
                            description: "Optional: Maximum number of documents to count",
                        },
                        skip: {
                            type: "integer",
                            description:
                                "Optional: Number of documents to skip before counting",
                        },
                        hint: {
                            type: "object",
                            description: "Optional: Index hint to force query plan",
                        },
                        readConcern: {
                            type: "object",
                            description: "Optional: Read concern for the count operation",
                        },
                        maxTimeMS: {
                            type: "integer",
                            description: "Optional: Maximum time to allow the count to run",
                        },
                        collation: {
                            type: "object",
                            description: "Optional: Collation rules for string comparison",
                        },
                    },
                    required: ["connectionId", "collectionName"],
                },
            }
        ]
    }
})

mcpServer.server.setRequestHandler(CallToolRequestSchema, async function (req, handlerExtra) {

    const sessionContext = sessionContextStore[handlerExtra?.sessionId || '']

    const command = req.params.name
    const {connectionId, collectionName} = req.params.arguments || {};

    const getCollection = async () => {
        if (!connectionId)
            throw new Error('Connection id is required')
        if (!collectionName)
            throw new Error('Collection name is required')

        // Validate collection name to prevent access to system collections
        if ((collectionName as string).startsWith("system.")) {
            throw new Error("Access to system collections is not allowed");
        }

        if (!sessionContext.connectionIds?.includes(connectionId as string))
            sessionContext.connectionIds?.push(connectionId as string);

        const connection = await getConnectionById(connectionId as string, sessionContext.accessToken)
        const db = await getDB(connection)
        return db.collection(collectionName as string)
    }

    let resultData: any
    switch (command) {
        case 'listConnections': {
            const connections = await listConnections(sessionContext.accessToken, sessionContext.tags)
            resultData = connections?.map((c: any) => readConnectionSchema(c))?.map((c: ConnectionSchema) => {
                delete c?.tables
                return c;
            })
            break;
        }

        case "listCollections": {
            const {nameOnly, filter} = req.params.arguments || {};

            try {
                if (!connectionId)
                    throw new Error('Connection id is required')

                const connection = await getConnectionById(connectionId as string, sessionContext.accessToken)
                const db = await getDB(connection)

                // Get the list of collections
                const options = filter ? {filter} : {};
                const collections = await db.listCollections(options).toArray();

                // If nameOnly is true, return only the collection names
                resultData = nameOnly
                    ? collections.map((collection: any) => collection.name)
                    : collections;
            } catch (error) {
                console.error('List collections failed', error)
                if (error instanceof Error) {
                    throw new Error(`Failed to list collections: ${error.message}`);
                }
                throw new Error("Failed to list collections: Unknown error");
            }
            break;
        }

        case 'query': {
            const collection = await getCollection()
            const {filter, projection, limit, explain} = req.params.arguments || {};

            // Validate and parse filter
            let queryFilter = {};
            if (filter) {
                if (typeof filter === "string") {
                    try {
                        queryFilter = JSON.parse(filter);
                    } catch (e) {
                        throw new Error("Invalid filter format: must be a valid JSON object",);
                    }
                } else if (typeof filter === "object" && !Array.isArray(filter)) {
                    queryFilter = filter;
                } else {
                    throw new Error("Query filter must be a plain object or ObjectId");
                }
                queryFilter = converObjectIdInFilter(queryFilter)
            }

            // Execute the find operation with error handling
            try {
                if (explain) {
                    // Use explain for query analysis
                    resultData = await collection
                        .find(queryFilter, {
                            projection,
                            limit: limit || 100,
                        } as FindOptions)
                        .explain(explain);
                } else {
                    // Regular query execution
                    const cursor = collection.find(queryFilter, {
                        projection,
                        limit: limit || 100,
                    } as FindOptions);
                    resultData = await cursor.toArray();
                }
            } catch (error) {
                console.error(`Execute query on collection ${collectionName} failed`, error)
                if (error instanceof Error) {
                    throw new Error(
                        `Failed to query collection ${collection.collectionName}: ${error.message}`,
                    );
                }
                throw new Error(
                    `Failed to query collection ${collection.collectionName}: Unknown error`,
                );
            }
            break;
        }
        case "aggregate": {
            const {pipeline, explain} = req.params.arguments || {};
            if (!Array.isArray(pipeline)) {
                throw new Error("Pipeline must be an array");
            }

            const collection = await getCollection()

            // Execute the aggregation operation with error handling
            try {
                if (explain) {
                    // Use explain for aggregation analysis
                    resultData = await collection.aggregate(pipeline).explain();
                } else {
                    // Regular aggregation execution
                    resultData = await collection.aggregate(pipeline).toArray();
                }
            } catch (error) {
                console.error(`Execute aggregate on collection ${collectionName} failed`, error)
                if (error instanceof Error) {
                    throw new Error(
                        `Failed to aggregate collection ${collection.collectionName}: ${error.message}`,
                    );
                }
                throw new Error(
                    `Failed to aggregate collection ${collection.collectionName}: Unknown error`,
                );
            }
            break;
        }
        case "count": {
            const args = req.params.arguments || {};
            const {query} = args;

            const collection = await getCollection()

            // Validate and parse query
            let countQuery = {};
            if (query) {
                if (typeof query === "string") {
                    try {
                        countQuery = JSON.parse(query);
                    } catch (e) {
                        throw new Error("Invalid query format: must be a valid JSON object",);
                    }
                } else if (typeof query === "object" && !Array.isArray(query)) {
                    countQuery = query;
                } else {
                    throw new Error("Query must be a plain object");
                }
                countQuery = converObjectIdInFilter(countQuery)
            }

            try {


                const options: CountDocumentsOptions = {
                    limit: typeof args.limit === "number" ? args.limit : undefined,
                    skip: typeof args.skip === "number" ? args.skip : undefined,
                    hint:
                        typeof args.hint === "object" && args.hint !== null
                            ? args.hint
                            : undefined,
                    readConcern:
                        typeof args.readConcern === "object" && args.readConcern !== null
                            ? (args.readConcern as ReadConcernLike)
                            : undefined,
                    maxTimeMS:
                        typeof args.maxTimeMS === "number" ? args.maxTimeMS : undefined,
                    collation:
                        typeof args.collation === "object" && args.collation !== null
                            ? (args.collation as CollationOptions)
                            : undefined,
                };

                // Remove undefined options
                Object.keys(options).forEach(
                    // @ts-ignore
                    (key) => options[key] === undefined && delete options[key],
                );

                // Execute count operation
                const count = await collection.countDocuments(countQuery, options);

                resultData = {
                    count: count,
                    ok: 1,
                }
            } catch (error) {
                console.error(`Execute count on collection ${collectionName} failed`, error)
                if (error instanceof Error) {
                    throw new Error(
                        `Failed to count documents in collection ${collection.collectionName}: ${error.message}`,
                    );
                }
                throw new Error(
                    `Failed to count documents in collection ${collection.collectionName}: Unknown error`,
                );
            }
            break;
        }

        default:
            throw new Error(`Unknown tool: ${command}`);
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

        const tags = req.query['tags'];

        const transport = new SSEServerTransport("/messages", res);
        sessionContextStore[transport.sessionId] = {
            sessionId: transport.sessionId,
            accessToken: userToken.id,
            expired: Date.now() + userToken.ttl * 1000,
            transport: transport,
            tags: typeof tags === 'string' ? [tags] : tags as string[],
            connectionIds: []
        };
        res.on('close', () => {
            closeDB(sessionContextStore[transport.sessionId]?.connectionIds)
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
