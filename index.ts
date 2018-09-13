import { imageService } from "./src/image-service"
import { Transform } from "./src/images";

const opts = {
  transformations: {
    default: Transform.resize(640),
    crop: Transform.smartCrop(100, 100)
  }
}

const images = imageService(
  "https://s3.amazonaws.com/pixelfly-demo/",
  opts
)

declare var fly: any
fly.http.respondWith(images)