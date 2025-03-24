import axios from 'axios';

const tmUrl = 'http://localhost:3000'

const client = axios.create({
    baseURL: tmUrl,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 60000,
    responseType: "json",
});
client.interceptors.request.use((config) => {
    return {...config, startTime: Date.now()};
})
client.interceptors.response.use(function (response) {
    const {method, url} = response.config
    const {status, statusText} = response;
    // @ts-ignore
    const startTime = response.config.startTime
    const endTime = Date.now()
    const {reqId, code} = response.data;

    console.log(`[${new Date().toLocaleString()}] [tm] ${method?.toUpperCase()} ${url} ${status} ${statusText} ${endTime - startTime}ms ${code} ${reqId}`);

    if (response.status === 200 && response.data?.code !== 'ok') {
        const error = new Error(`${response.data?.message}`);
        error.name = response.data.code;
        throw error;
    }
    return response;
}, (error) => {
    return Promise.reject(error);
})


export const login = async (accessCode: string) => {
    try {
        const res = await client.post('/api/users/generatetoken', {
            accesscode: accessCode
        })
        return res.data.data
    } catch (e) {
        console.error('Login TM failed', e)
        return undefined
    }
}

export const health = async (accessToken: string) => {
    try {
        const res = await client.get('/health', {
            params: {
                access_token: accessToken
            }
        })
        return res.data.code === 'ok'
    } catch (e) {
        console.error('Check TM health failed', e)
        return false
    }
}

export const listConnections = async (accessToken: string) => {
    try {
        const res = await client.get('/api/Connections', {
            params: {
                access_token: accessToken,
                noSchema: false,
                filter: JSON.stringify({
                    where: {
                        status: 'ready'
                    },
                    limit: 10
                })
            }
        })
        const pageData = res.data.data || {items: []}
        return pageData.items.map((c: any) => {
            return {
                id: c.id,
                name: c.name,
                databaseType: c.database_type,
                connectionType: c.connection_type,
                status: c.status,
                tableCount: c.tableCount,
                loadSchemaTime: c.loadSchemaTime,
                schema: c.schema
            }
        }) || []
    } catch (e) {
        console.error('List Connections failed', e)
        return []
    }
}

export const getConnectionById = async (id: string, accessToken: string) => {
    try {
        const res = await client.get(`/api/Connections/${id}`, {
            params: {
                access_token: accessToken
            }
        })
        const data = res.data.data || {}
        return data || {}
    } catch (e) {
        console.error('List Connections failed', e)
        return {}
    }
}

export const queryDataFromTable = async (connectionId: string, tableId: string, accessToken: string) => {
    try {
        const res = await client.post(`/api/proxy/call`, {
            className: "QueryDataBaseDataService",
            method: "getData",
            args: [connectionId, tableId],
        }, {
            timeout: 60000,
            params: {
                access_token: accessToken
            }
        })
        const data = res.data?.data?.sampleData || []
        return data || []
    } catch (e) {
        console.error('Query Data Failed', e)
        return []
    }
}