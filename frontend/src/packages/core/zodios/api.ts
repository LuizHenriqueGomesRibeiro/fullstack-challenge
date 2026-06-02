import { makeApi, Zodios } from "@zodios/core";

const publicEndpoints = makeApi([] as const);

const publicApi = new Zodios(
  publicEndpoints
);

export {
  publicApi
}