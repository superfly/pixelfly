import { Transformations, Transformer } from "transformations";
import proxy from "@fly/fetch/proxy"
import { Image } from "@fly/image";
import { responseCache } from "@fly/cache"

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
  rootPath?: string,
  transformations?: NamedTransformations,
  urlParser?: TransformURLParser,
  webp?: boolean,
  outputs?: ImageOutputOptions
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
    const op = parser(new URL(req.url), opts)
    const webp = !!(opts && opts.webp === true && webpAllowed(op, req))
    const key = cacheKey(op, webp)
    let resp: Response = await responseCache.get(key)
    if(resp){
      resp.headers.set("Fly-Cache", "HIT")
      return resp
    }
    //console.log("url:", JSON.stringify(op), key)

    const breq = new Request(op.url.toString(), req)
    resp = await fetchFromCache(breq, origin)
    let start = Date.now()
    if(!isImage(resp)) return resp
    if (req.method === "GET" && (op.transformations.length > 0 || webp) ){
      let img = await loadImage(resp)
      if(op.transformations) {
        for (const t of op.transformations) {
          if (t instanceof Array) {
            for (const t2 of t) {
              //console.log("applying:", t2.name)
              img = await t2.exec(img)
            }
          } else {
            //console.log("applying:", t.name)
            img = await t.exec(img)
          }
        }
      }


      applyOutputOptions(img, opts && opts.outputs)
      if(webp){
        img = img.webp({ force: true })
        resp.headers.set("content-type", "image/webp")
      }else{
        //console.log("webp not allowed:", opts && opts.webp, op.url.pathname)
      }
      const body = await img.toBuffer()
      //console.log("Image processing:", Date.now() - start)
      resp = new Response(body.data, resp)
      resp.headers.set("content-length", body.data.byteLength.toString())

      await responseCache.set(key, resp, { tags: [op.url.toString()], ttl: 3600 })
      resp.headers.set("Fly-Cache", "MISS")
    }
    return resp
  }
}
function applyOutputOptions(img: Image, opts?: ImageOutputOptions){
  if(!opts) return
  for(const k of Object.getOwnPropertyNames(opts)){
    const v = opts[k]
    if(v){
      opts[k] = Object.assign(v, { force: false })
    }else{
      opts[k] = { force: false }
    }
  }
  if(opts.webp) img.webp(opts.webp)
  const jpeg = opts.jpeg || opts.jpg
  if(jpeg) img.jpeg(jpeg)
  if(opts.png) img.png(opts.png)
}
async function fetchFromCache(req: Request, origin: FetchFn) {
  let start = Date.now()
  let resp: Response = await responseCache.get(req.url)
  if (resp) {
    resp.headers.set("Fly-Cache", "hit")
    //console.log(`Image fetch from cache (${Date.now() - start}):`, req.url)
    return resp
  }

  resp = await origin(req)

  if (resp.status === 200 && req.method === "GET") {
    //console.log(`Image fetch from URL (${Date.now() - start}):`, req.url)
    start = Date.now()
    await responseCache.set(req.url, resp, { tags: [req.url], ttl: 3600 * 24 * 30 * 6 })
    //console.log(`Image write to cache (${Date.now() - start}):`, req.url, resp.headers.get("content-length"))
    resp.headers.set("Fly-Cache", "miss")
    return resp
  }
  return resp
}

async function loadImage(resp: Response): Promise<Image> {
  if (!isImage(resp)) {
    throw new Error("Response wasn't an image")
  }
  const raw = await resp.arrayBuffer()
  const img = new Image(raw)
  
  const meta = img.metadata()
  console.log("Image:", meta)
  
  return img
}

function isImage(resp: Response): boolean{
  const contentType = resp.headers.get("Content-Type") || ""
  if (!contentType.includes("image/") || contentType.includes("image/gif")) {
    return false
  }
  return true
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