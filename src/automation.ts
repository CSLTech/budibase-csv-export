import { AutomationStepInput } from '@budibase/types';
import axios from 'axios';
import { AxiosInstance, AxiosResponse } from 'axios';
import { stringify } from 'csv-stringify';
import {
    CopyObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import stream from 'node:stream';
import { v4 as uuidv4 } from 'uuid';

function validateInputs(inputs: Record<string, any>) {
    const { tableId, query, region, endpoint, bucket, accessKey, secret, budibaseApiUrl, budibaseApiKey } = inputs;

    if (!tableId) {
        throw new Error('You must select a table to query.');
    }

    if (!region) {
        throw new Error('Region is mandatory');
    }

    if (!bucket) {
        throw new Error('Bucket is mandatory');
    }

    if (!accessKey) {
        throw new Error('Access Key is mandatory');
    }

    if (!secret) {
        throw new Error('Secret is mandatory');
    }

    if (!budibaseApiUrl) { //There is nothing passed to the automations to know this
        throw new Error('Budibase API URL is mandatory');
    }

    if (!budibaseApiKey) { //The type hints at an API in the automation context key, but from my testing, it's not preent
        throw new Error('Budibase API Key is mandatory');
    }
}

//There should be a way to access the internals of the API directly given automations don't run in an isolated context, but this would be the minified/packaged versions and would be very unstable.
function createApiClient(apiUrl: string, apiKey: string, appId: string) {
    return axios.create({
        baseURL: apiUrl,
        headers: {
            'x-budibase-app-id': appId,
            'x-budibase-api-key': apiKey
        }
    });
}

async function *getRows(client: AxiosInstance, tableId: string, query: object) {
    let bookmark;
    let hasNextPage = true;

    while (hasNextPage) {
        const result: AxiosResponse<any> = await client.post(`tables/${tableId}/rows/search`, {
            query,
            paginate: true,
            limit: 1000,
            bookmark
        });

        if(result.status !== 200) {
            throw new Error('Invalid response from budibase API.');
        }

        hasNextPage = result.data.hasNextPage;
        bookmark = result.data.bookmark;

        for (const row of result.data.data) {
            yield row;
        }
    }
}


export default async function run({ inputs, appId }: AutomationStepInput) {
    try {
        validateInputs(inputs);
    }
    catch (err: any) {
        return {
            success: false,
            response: {
                message: err.message,
            }
        };
    }

    const { tableId, query, region, endpoint, bucket, accessKey, secret, budibaseApiUrl, budibaseApiKey } = inputs;

    const key = `${uuidv4()}.csv`;

    const s3 = new S3({
        region,
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secret
        },
        endpoint
    });

    const apiClient = createApiClient(budibaseApiUrl, budibaseApiKey, appId);

    const abortController = new AbortController();
    const outputStream = stream.addAbortSignal(abortController.signal, new stream.PassThrough());
    const s3Upload = new Upload({
        client: s3,
        params: {
            Bucket: bucket,
            Key: key,
            Body: outputStream
        },
        abortController
    });

    s3Upload.on('httpUploadProgress', (progress) => {
        console.log('S3 upload progress:', progress);
    });

    try {
        const stringifier = stringify({
            header: true
        });

        stringifier.pipe(outputStream).on('error', (err: any) => abortController.abort(err.message));

        for await (const row of getRows(apiClient, tableId, query)) {
            if (abortController.signal.aborted) {
                throw new Error(abortController.signal.reason);
            }

            stringifier.write(row);
        }

        stringifier.end();

        await s3Upload.done();
    }
    catch (err: any) {
        console.log(err.stack);

        if (!abortController.signal.aborted) {
            abortController.abort();
        }

        if (err.name === 'AbortError') {
            err = new Error(abortController.signal.reason);
        }

        return {
            success: false,
            response: {
                message: err.message,
            }
        };
    }

    return {
        success: true,
        key
    };
}
