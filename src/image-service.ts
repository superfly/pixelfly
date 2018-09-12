import { Transformation } from "transformations";

export interface ImageServiceOptions {
  transformations?: {
    [key: string]: Transformation[] | Transformation
  }
}
export type FetchFn = (req: RequestInfo, init?: RequestInit) => Promise<Response>
export function imageService(origin: FetchFn, opts?: ImageServiceOptions): FetchFn {
  return async function imageServiceFetch(req: RequestInfo, init?: RequestInit) {
    return origin(req, init)
  }
}