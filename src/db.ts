import {Db, MongoClient, ReadPreference} from "mongodb";

const readOnly = true;
const mongoClients: { [key: string]: MongoClient } = {}

export const getDB = async (connection: { [key: string]: any }) => {

    if (mongoClients[connection.id]) {
        return mongoClients[connection.id].db();
    }

    const config: { [key: string]: any } = connection.config
    let connectionString;
    if (config.isUri) {
        connectionString = config.uri
    } else {
        connectionString = `mongodb://${config.host}/${config.database}?${config.additionalString}`;
    }

    const options = readOnly
        ? {readPreference: ReadPreference.SECONDARY_PREFERRED}
        : {};
    const client = new MongoClient(connectionString, options);
    await client.connect();
    if (mongoClients[connection.id]) {
        await client.close(false)
    } else {
        mongoClients[connection.id] = client;
    }
    return mongoClients[connection.id].db();
}

export const closeDB = async (connectionIds: string[] | undefined) => {
    if (connectionIds) {
        for (const id of connectionIds) {
            if (mongoClients[id]) {
                const client = mongoClients[id]
                delete mongoClients[id]
                await client.close();
            }
        }
    }
}