import { Image } from "@fly/image"
export type Dimension = number | string
export type Dimensions = Width | Height | WidthHeight

export type Width = {
  width: Dimension
}
export type Height = {
  height: Dimension
}

export type Coordinates = {
  x: number,
  y: number
}

export type WidthHeight = {
  width: Dimension,
  height: Dimension
}

export enum ResizeMode {
  scale = "scale",
  fit = "fit",
  limit = "limit"
}
export interface ResizeOptions {
  kernel?: Image.kernel,
  fastShrinkOnLoad?: boolean,
  mode?: ResizeMode
}

export interface CropOptions {
  strategy: Image.gravity | Image.strategy
}

export type Resize = ResizeOptions & Dimensions
export type Crop = CropOptions & Dimension

export type Transformation = Resize | Crop