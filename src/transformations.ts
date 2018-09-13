import { Image } from "@fly/image"
export type Dimension = number | string
export type Dimensions = Width | Height | WidthHeight

export type Width = {
  width: Dimension
  height: undefined
}
export type Height = {
  height: Dimension
  width: undefined
}

export type Coordinates = {
  x: number,
  y: number
}

export type WidthHeight = {
  width: Dimension,
  height: Dimension | undefined
}

export enum ResizeMode {
  scale = "scale",
  fit = "fit",
  limit = "limit"
}

export type ResizeOptions = {
  kernel?: Image.kernel,
  fastShrinkOnLoad?: boolean,
  mode?: ResizeMode
} & Dimensions

export async function resizeOperation(img: Image) {
  return img;
}

export interface TransformOp {
  (img: Image): Promise<Image>
}
export type CropOptions = {
  anchor?: Image.gravity | Image.strategy
} & Dimensions

export abstract class Transformer<T>{
  constructor(public name: string, public params: T) {
  }

  abstract exec(img: Image): Promise<Image>
}
export type Transformations = (Transformer<any>[] | Transformer<any>)[]

export class Resize extends Transformer<ResizeOptions>{
  constructor(public opts: ResizeOptions) {
    super("resize", opts)
  }
  async exec(img: Image) {
    const d = resolveDimensions(this.opts, img)
    //noop
    if (!d.width && !d.height) return img
    img.resize(d.width, d.height, this.opts)
    return img
  }
}

export class Crop extends Transformer<CropOptions>{
  constructor(public opts: CropOptions) {
    super('crop', opts)
  }

  async exec(img: Image) {
    const d = resolveDimensions(this.opts, img)
    if (!d.width && !d.height) return img
    img.resize(d.width, d.height).crop(this.opts.anchor)
    return img
  }
}

export class Transform {
  static resize(width: number, opts?: ResizeOptions): Resize
  static resize(width: number, height?: number, opts?: ResizeOptions): Resize
  static resize(widthOrOpts?: Dimension | ResizeOptions, heightOrOpts?: number | ResizeOptions, opts?: ResizeOptions): Resize {
    let width = typeof widthOrOpts === "number" ? widthOrOpts : undefined
    let height = typeof heightOrOpts === "number" ? heightOrOpts : undefined
    if (!opts && typeof heightOrOpts === "object") {
      height = undefined
      opts = heightOrOpts
    }
    if (!opts && typeof widthOrOpts === "object") {
      opts = widthOrOpts
      width = undefined
    }
    let t: ResizeOptions = opts ?
      Object.assign({ width, height }, opts) :
      toDimensions(width, height)

    const t2 = new Resize(t)
    return t2
  }

  static smartCrop(width: Dimension, height?: Dimension): Crop {
    return new Crop({ width: width, height: height, anchor: Image.strategy.entropy })
  }
}

function toDimensions(width?: Dimension, height?: Dimension): Dimensions {
  if (width) {
    return { width, height } as Dimensions
  }
  if (height) {
    return { height } as Dimensions
  }
  throw new Error("You must specify either a width or a height")
}

function resolveDimensions({ width, height }: Dimensions, reference: Image) {
  let pctWidth = toPercent(width)
  let pctHeight = toPercent(height)

  if (pctWidth || pctHeight) {
    const meta = reference.metadata()
    if (pctWidth && meta.width) width = meta.width * pctWidth
    if (pctHeight && meta.height) height = meta.height * pctHeight
  }
  // width and height should be number or undefined now
  if (typeof width === "string") width = parseInt(width)
  if (typeof height === "string") height = parseInt(height)
  return { width, height }
}

function toPercent(d: Dimension | undefined) {
  let pct: number | undefined
  if (d && typeof d === "string" && d.endsWith("%") && !(isNaN(pct = parseInt(d)))) {
    return (pct / 100)
  }
}