import proxy from "@fly/fetch/proxy"
import { imageService } from "./src/image-service"

const origin = proxy("https://s3.amazonaws.com/pixelfly-demo/")

declare var fly: any
fly.http.respondWith(imageService(origin))