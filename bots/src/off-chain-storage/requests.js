import { compose, map, pick } from "ramda";
import { buildKeyConditionExpression, buildSetUpdateExpression, createEnhancedClient } from "./utils";

const { client, batchWrite } = createEnhancedClient();

const requestsTable = process.env.REQUESTS_TABLE_NAME;

function normalizeData({ questionId, requester, chainId, ...rest }) {
  return {
    requestId: `${chainId}/${questionId}/${requester}`,
    chainId,
    ...rest,
  };
}

function denormalizeData({ requestId, ...rest }) {
  const [chainId, questionId, requester] = requestId.split("/");
  return { questionId, requester, chainId, ...rest };
}

const extractStoredData = pick(["requestId", "chainId", "status", "arbitratorAnswer", "latestAnswer"]);

export async function saveRequests(requests) {
  const createPutRequest = (item) => ({
    PutRequest: {
      Item: item,
    },
  });

  const createBatchItem = compose(createPutRequest, extractStoredData, normalizeData);

  return compose(batchWrite(requestsTable), map(createBatchItem))(requests);
}

export async function fetchAllRequestIds() {
  const data = await client
    .scan({
      TableName: requestsTable,
      ProjectionExpression: "requestId, chainId",
    })
    .promise();

  return map(denormalizeData, data.Items);
}

export async function deleteAllRequests() {
  const createDeleteRequest = (item) => ({
    DeleteRequest: {
      Key: item,
    },
  });

  const data = await fetchAllRequestIds();

  if (data.length === 0) {
    return;
  }

  return compose(
    batchWrite(requestsTable),
    map(compose(createDeleteRequest, pick(["requestId", "chainId"], normalizeData)))
  )(data);
}

export async function fetchRequestsByChainIdAndStatus({ chainId, status }) {
  const data = await client
    .query({
      TableName: requestsTable,
      IndexName: "byChainIdAndStatus",
      ...buildKeyConditionExpression({ chainId, status }),
    })
    .promise();

  return map(denormalizeData, data.Items);
}

export async function fetchRequestsByChainId({ chainId }) {
  const data = await client
    .query({
      TableName: requestsTable,
      IndexName: "byChainIdAndStatus",
      ...buildKeyConditionExpression({ chainId }),
    })
    .promise();

  return map(denormalizeData, data.Items);
}

export async function updateRequest(data) {
  const { requestId, chainId, ...attrs } = normalizeData(data);

  const result = await client
    .update({
      TableName: requestsTable,
      Key: {
        requestId,
        chainId,
      },
      ReturnValues: "ALL_NEW",
      ...buildSetUpdateExpression(extractStoredData(attrs)),
    })
    .promise();

  return denormalizeData(result.Attributes);
}

export async function removeRequest(data) {
  const { requestId, chainId } = normalizeData(data);

  const result = await client
    .delete({
      TableName: requestsTable,
      Key: {
        requestId,
        chainId,
      },
      ReturnValues: "ALL_OLD",
    })
    .promise();

  return denormalizeData(result.Attributes);
}
