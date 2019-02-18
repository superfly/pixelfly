import { Transformations, Transformer, Operation } from "transformations";
import proxy from "@fly/fetch/proxy"
import { Image } from "@fly/image";

export interface NamedTransformations {
  [key: string]: (Transformer<any> | Transformer<any>[])
}
export interface ImageOutputOptions
{
  [key: string]: any,
  webp?: Image.WebpOptions,
  png?: Image.PngOptions,
  jpg?: Image.JpegOptions,
  jpeg?: Image.JpegOptions
}

export interface ImageServiceOptions {
  imageService: string,
  rootPath?: string,
  transformations?: NamedTransformations,
  urlParser?: TransformURLParser,
  webp?: boolean,
  outputs?: ImageOutputOptions,
}
export type FetchFn = (req: RequestInfo, init?: RequestInit) => Promise<Response>

export function imageService(origin: string, opts: ImageServiceOptions): FetchFn {
  const parser = opts.urlParser || defaultParser;
  const imageServiceHostname = opts.imageService;

  return async function imageServiceFetch(req: RequestInfo, init?: RequestInit) {
    if (typeof req === "string") req = new Request(req, init)
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Only GET/HEAD allowed", { status: 405 })
    }
    const op = parser(new URL(req.url), opts)
    let operations = pipeline(op);

    if (opts.webp && webpAllowed(op, req)) {
      operations.push({
        operation: "convert",
        params: {
          type: "webp"
        }
      })
    }

    let path = op.url.pathname;
    if (path.startsWith("/")) {
      path = path.substr(1);
    }

    let originUrl = new URL(path, origin);

    let imageServiceUrl = new URL(`pipeline`, opts.imageService);
    imageServiceUrl.searchParams.set("url", originUrl.href);
    imageServiceUrl.searchParams.set("operations", JSON.stringify(operations));

    return fetch(new Request(imageServiceUrl.href));
  }
}

function pipeline(op: TransformURL): Operation[] {
  let pipeline = [];

  for (const transformations of op.transformations) {
    if (transformations instanceof Array) {
      for (const transformation of Array.from(transformations)) {
        pipeline.push(transformation.operation());
      }
    } else {
      pipeline.push(transformations.operation());
    }
  }

  console.log("pipeline", pipeline);

  return pipeline;
}

export interface TransformURL {
  url: URL,
  transformations: Transformations
}

export type TransformURLParser = (url: URL, opts?: ImageServiceOptions) => TransformURL
export function defaultParser(url: URL, opts?: ImageServiceOptions): TransformURL {
  // format: /<transformation>[,<transformation>]/path/to/image.jpg
  //
  const named = opts && opts.transformations

  if(opts && opts.rootPath && url.pathname.startsWith(opts.rootPath)){
    // strip off root of path
    const path = url.pathname.substring(opts.rootPath.length - 1)
    url = new URL(path, url)
  }
  const part = url.pathname.substring(1, url.pathname.indexOf('/', 1))
  if (part === "/") {
    return { url: url, transformations: [] }
  }
  const parts = part.split(",")
  const transforms: Transformations = []

  for (const p of parts) {
    if (named) {
      const t = named[p]
      if (t) {
        transforms.push(t)
      }
    }
  }
  if (transforms.length > 0) {
    //console.log(url.pathname.substr(part.length + 1))
    url = new URL(url.pathname.substr(part.length + 1), url)
  }
  return {
    url: url,
    transformations: transforms
  }
}

const webpTypes = /\.(jpe?g|png)(\?.*)?$/

export function webpAllowed(op: TransformURL, req: Request){
  const accept = req.headers.get("accept") || ""
  if(
    op.url.pathname.match(webpTypes) &&
    accept.includes("image/webp")
  ){
    return true
  }
  return false
}
