import { Transformations, Transformer } from "transformations";
import proxy from "@fly/fetch/proxy"
import { Image } from "@fly/image";
import { responseCache } from "@fly/cache"

export interface NamedTransformations {
  [key: string]: (Transformer<any> | Transformer<any>[])
}
export interface ImageServiceOptions {
  transformations?: NamedTransformations,
  urlParser?: TransformURLParser,
  webp?: boolean
}
export type FetchFn = (req: RequestInfo, init?: RequestInit) => Promise<Response>

export function imageService(origin: FetchFn | string, opts?: ImageServiceOptions): FetchFn {
  return async function imageServiceFetch(req: RequestInfo, init?: RequestInit) {
    const parser = opts && opts.urlParser || defaultParser
    if (typeof origin === "string") {
      origin = proxy(origin)
    }
    if (typeof req === "string") req = new Request(req, init)
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Only GET/HEAD allowed", { status: 405 })
    }
    const op = parser(new URL(req.url), opts && opts.transformations)
    const webp = !!(opts && opts.webp === true && webpAllowed(op, req))
    const key = cacheKey(op, webp)
    let resp: Response = await responseCache.get(key)
    if(resp){
      return resp
    }
    console.log("url:", JSON.stringify(op), key)

    const breq = new Request(op.url.toString(), req)
    resp = await fetchFromCache(breq, origin)
    if (req.method === "GET" && (op.transformations.length > 0 || webp) ){
      let img = await loadImage(resp)
      if(op.transformations) {
        for (const t of op.transformations) {
          if (t instanceof Array) {
            for (const t2 of t) {
              console.log("applying:", t2.name)
              img = await t2.exec(img)
            }
          } else {
            console.log("applying:", t.name)
            img = await t.exec(img)
          }
        }
      }

      if(webp){
        img = img.webp()
        resp.headers.set("content-type", "image/webp")
      }else{
        console.log("webp not allowed:", opts && opts.webp, op.url.pathname)
      }
      const body = await img.toBuffer()
      resp = new Response(body.data, resp)
      resp.headers.set("content-length", body.data.byteLength.toString())

      await responseCache.set(key, resp, { tags: [op.url.toString()], ttl: 3600 })
    }
    return resp
  }
}

async function fetchFromCache(req: Request, origin: FetchFn) {
  let resp: Response = await responseCache.get(req.url)
  if (resp) {
    resp.headers.set("Fly-Cache", "hit")
    return resp
  }

  resp = await origin(req)

  if (resp.status === 200 && req.method === "GET") {
    await responseCache.set(req.url, resp, { tags: [req.url], ttl: 3600 })
    resp.headers.set("Fly-Cache", "miss")
    return resp
  }
  return resp
}

async function loadImage(resp: Response): Promise<Image> {
  const contentType = resp.headers.get("Content-Type") || ""
  if (!contentType.includes("image/")) {
    throw new Error("Response wasn't an image: " + contentType)
  }
  const raw = await resp.arrayBuffer()
  return new Image(raw)
}

export interface TransformURL {
  url: URL,
  transformations: Transformations
}

export type TransformURLParser = (url: URL, named?: NamedTransformations) => TransformURL
export function defaultParser(url: URL, named?: NamedTransformations): TransformURL {
  // format: /<transformation>[,<transformation>]/path/to/image.jpg
  //
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
    console.log(url.pathname.substr(part.length + 1))
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

function cacheKey(op: TransformURL, webp: boolean){
  const transforms = op.transformations && op.transformations.length > 0 ?
    (<any>crypto).subtle.digestSync('sha-1', JSON.stringify(op.transformations), 'hex') : 
    null
  return [
    op.url,
    transforms,
    webp
  ].join("|")
}