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

export type ResizeOptions = {
  kernel?: Image.kernel,
  fastShrinkOnLoad?: boolean
} & Image.ResizeOptions & Dimensions

export interface Operation {
  operation: String;
  params: { [name: string]: any };
}

export interface TransformOp {
  (img: Image): Promise<Image>
}

export enum Gravity {
  Center = "centre",
  North = "north",
  South = "south",
  East = "east",
  West = "west",
  Smart = "smart",
}

export type CropOptions = {
  gravity: Gravity
} & Dimensions

export abstract class Transformer<T>{
  constructor(public name: string, public params: T) {
  }

  abstract operation(): Operation
}
export type Transformations = (Transformer<any>[] | Transformer<any>)[]

export class Resize extends Transformer<ResizeOptions>{
  constructor(public params: ResizeOptions) {
    super("resize", params)
  }

  operation() {
    return {
      operation: "fit",
      params: {
        height: this.params.height,
        width: this.params.width,
      }
    }
  }
}

export class Crop extends Transformer<CropOptions>{
  constructor(public params: CropOptions) {
    super('crop', params)
  }

  operation() {
    return {
      operation: "crop",
      params: {
        gravity: this.params.gravity,
        height: this.params.height,
        width: this.params.width,
      }
    }
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
    return new Crop({ width: width, height: height, gravity: Gravity.Smart })
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

