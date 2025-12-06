import * as THREE from "three"
import vertexShader from "./shaders/vertex.glsl"
import fragmentShader from "./shaders/fragment.glsl"
import { Size } from "./types/types"
import normalizeWheel from "normalize-wheel"
import { SpotifyPlayer } from "./spotifyPlayer"

interface Props {
  scene: THREE.Scene
  sizes: Size
  camera: THREE.Camera
}

interface ImageInfo {
  width: number
  height: number
  aspectRatio: number
  uvs: {
    xStart: number
    xEnd: number
    yStart: number
    yEnd: number
  }
}

export default class Planes {
  scene: THREE.Scene
  geometry: THREE.PlaneGeometry
  material: THREE.ShaderMaterial
  mesh: THREE.InstancedMesh
  meshCount: number = 500
  sizes: Size
  camera: THREE.Camera
  raycaster: THREE.Raycaster
  mouse: THREE.Vector2
  spotifyPlayer: SpotifyPlayer
  activeAlbumIndex: number = -1
  drag: {
    xCurrent: number
    xTarget: number
    yCurrent: number
    yTarget: number
    isDown: boolean
    startX: number
    startY: number
    lastX: number
    lastY: number
  } = {
    xCurrent: 0,
    xTarget: 0,
    yCurrent: 0,
    yTarget: 0,
    isDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  }
  shaderParameters = {
    maxX: 0,
    maxY: 0,
  }
  scrollY: {
    target: number
    current: number
    direction: number
  } = {
    target: 0,
    current: 0,
    direction: 0,
  }
  dragSensitivity: number = 1
  dragDamping: number = 0.1
  dragElement?: HTMLElement
  imageInfos: ImageInfo[] = []
  atlasTexture: THREE.Texture | null = null
  blurryAtlasTexture: THREE.Texture | null = null

  constructor({ scene, sizes, camera }: Props) {
    this.scene = scene
    this.sizes = sizes
    this.camera = camera

    this.shaderParameters = {
      maxX: this.sizes.width * 2,
      maxY: this.sizes.height * 2,
    }

    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    this.spotifyPlayer = new SpotifyPlayer()

    this.createGeometry()
    this.createMaterial()
    this.createInstancedMesh()
    this.fetchCovers()

    window.addEventListener("wheel", this.onWheel.bind(this))
    this.setupSpotifyPlayerUI()
  }

  createGeometry() {
    this.geometry = new THREE.PlaneGeometry(1, 1.69, 1, 1)
    this.geometry.scale(2, 2, 2)
  }

  async fetchCovers() {
    // Using your Spotify 2025 top 100 songs!
    const urls: string[] = new Array(100)
      .fill(0)
      .map((_, i) => `/my-covers/cover_${i}.jpg`)
    await this.loadTextureAtlas(urls)
    this.createBlurryAtlas()
    this.fillMeshData()
    
    // Hide loader
    const loader = document.getElementById('loader')
    if (loader) {
      loader.classList.add('hidden')
    }
  }

  async loadTextureAtlas(urls: string[]) {
    // Load all images with CORS-safe approach to avoid tainted canvas
    const imagePromises = urls.map(async (path) => {
      try {
        const res = await fetch(path, { mode: "cors" })
        if (!res.ok) throw new Error(`Failed to fetch image: ${path}`)
        const blob = await res.blob()
        const bitmap = await createImageBitmap(blob)
        return bitmap as CanvasImageSource
      } catch (err) {
        // Fallback to HTMLImageElement with crossOrigin
        return await new Promise<CanvasImageSource>((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = "anonymous"
          img.onload = () => resolve(img)
          img.onerror = (e) => reject(e)
          img.src = path
        })
      }
    })

    const images = await Promise.all(imagePromises)

    // Calculate atlas dimensions (for simplicity, we'll stack images vertically)
    const atlasWidth = Math.max(
      ...images.map((img: any) => img.width as number)
    )
    let totalHeight = 0

    // First pass: calculate total height
    images.forEach((img: any) => {
      totalHeight += img.height as number
    })

    // Create canvas with calculated dimensions
    const canvas = document.createElement("canvas")
    canvas.width = atlasWidth
    canvas.height = totalHeight
    const ctx = canvas.getContext("2d")!

    // Second pass: draw images and calculate normalized coordinates
    let currentY = 0
    this.imageInfos = images.map((img: any) => {
      const aspectRatio = (img.width as number) / (img.height as number)

      // Draw the image
      ctx.drawImage(img as any, 0, currentY)

      // Calculate normalized coordinates

      const info = {
        width: img.width,
        height: img.height,
        aspectRatio,
        uvs: {
          xStart: 0,
          xEnd: (img.width as number) / atlasWidth,
          yStart: 1 - currentY / totalHeight,
          yEnd: 1 - (currentY + (img.height as number)) / totalHeight,
        },
      }

      currentY += img.height as number
      return info
    })

    // Create texture from canvas
    this.atlasTexture = new THREE.Texture(canvas)
    this.atlasTexture.wrapS = THREE.ClampToEdgeWrapping
    this.atlasTexture.wrapT = THREE.ClampToEdgeWrapping
    this.atlasTexture.minFilter = THREE.LinearFilter
    this.atlasTexture.magFilter = THREE.LinearFilter
    this.atlasTexture.needsUpdate = true
    this.material.uniforms.uAtlas.value = this.atlasTexture
  }

  createBlurryAtlas() {
    //create a blurry version of the atlas for far away planes
    if (!this.atlasTexture) return

    const blurryCanvas = document.createElement("canvas")
    blurryCanvas.width = this.atlasTexture.image.width
    blurryCanvas.height = this.atlasTexture.image.height
    const ctx = blurryCanvas.getContext("2d")!
    ctx.filter = "blur(100px)"
    ctx.drawImage(this.atlasTexture.image, 0, 0)
    this.blurryAtlasTexture = new THREE.Texture(blurryCanvas)
    this.blurryAtlasTexture.wrapS = THREE.ClampToEdgeWrapping
    this.blurryAtlasTexture.wrapT = THREE.ClampToEdgeWrapping
    this.blurryAtlasTexture.minFilter = THREE.LinearFilter
    this.blurryAtlasTexture.magFilter = THREE.LinearFilter
    this.blurryAtlasTexture.needsUpdate = true
    this.material.uniforms.uBlurryAtlas.value = this.blurryAtlasTexture
  }

  createMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uMaxXdisplacement: {
          value: new THREE.Vector2(
            this.shaderParameters.maxX,
            this.shaderParameters.maxY
          ),
        },
        uWrapperTexture: {
          value: new THREE.TextureLoader().load("/spt-3.png", (tex) => {
            //make the texture as sharp as possible
            tex.minFilter = THREE.NearestFilter
            tex.magFilter = THREE.NearestFilter
            tex.generateMipmaps = false
            tex.needsUpdate = true
          }),
        },
        uAtlas: new THREE.Uniform(this.atlasTexture),
        uBlurryAtlas: new THREE.Uniform(this.blurryAtlasTexture),
        uScrollY: { value: 0 },
        // Calculate total length of the gallery
        uSpeedY: { value: 0 },
        uDrag: { value: new THREE.Vector2(0, 0) },
        uActiveAlbum: { value: -1 },
        uGlowIntensity: { value: 0.5 },
      },
    })
  }

  createInstancedMesh() {
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.meshCount
    )
    this.scene.add(this.mesh)
  }

  fillMeshData() {
    const initialPosition = new Float32Array(this.meshCount * 3)
    const meshSpeed = new Float32Array(this.meshCount)
    const aTextureCoords = new Float32Array(this.meshCount * 4)

    for (let i = 0; i < this.meshCount; i++) {
      initialPosition[i * 3 + 0] =
        (Math.random() - 0.5) * this.shaderParameters.maxX * 2 // x
      initialPosition[i * 3 + 1] =
        (Math.random() - 0.5) * this.shaderParameters.maxY * 2 // y

      //from -15 to 7

      initialPosition[i * 3 + 2] = Math.random() * (7 - -30) - 30 // z

      meshSpeed[i] = Math.random() * 0.5 + 0.5

      const imageIndex = i % this.imageInfos.length

      aTextureCoords[i * 4 + 0] = this.imageInfos[imageIndex].uvs.xStart
      aTextureCoords[i * 4 + 1] = this.imageInfos[imageIndex].uvs.xEnd
      aTextureCoords[i * 4 + 2] = this.imageInfos[imageIndex].uvs.yStart
      aTextureCoords[i * 4 + 3] = this.imageInfos[imageIndex].uvs.yEnd
    }

    this.geometry.setAttribute(
      "aInitialPosition",
      new THREE.InstancedBufferAttribute(initialPosition, 3)
    )
    this.geometry.setAttribute(
      "aMeshSpeed",
      new THREE.InstancedBufferAttribute(meshSpeed, 1)
    )

    this.mesh.geometry.setAttribute(
      "aTextureCoords",
      new THREE.InstancedBufferAttribute(aTextureCoords, 4)
    )
  }

  setupSpotifyPlayerUI() {
    const playPauseBtn = document.getElementById("play-pause-btn")
    const playIcon = document.getElementById("play-icon")
    const pauseIcon = document.getElementById("pause-icon")

    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        this.spotifyPlayer.togglePlayPause()
        const isPlaying = this.spotifyPlayer.getIsPlaying()
        
        if (playIcon && pauseIcon) {
          playIcon.style.display = isPlaying ? "none" : "block"
          pauseIcon.style.display = isPlaying ? "block" : "none"
        }
      })
    }

    this.spotifyPlayer.onTrackChange((track) => {
      const bottomPlayer = document.getElementById("bottom-player")
      const albumArt = document.getElementById("player-album-art") as HTMLImageElement
      const trackName = document.getElementById("player-track-name")
      const artistName = document.getElementById("player-artist-name")

      if (track && bottomPlayer) {
        bottomPlayer.classList.remove("hidden")
        
        if (albumArt) albumArt.src = track.albumImage640
        if (trackName) trackName.textContent = track.trackName
        if (artistName) artistName.textContent = track.artists.map(a => a.name).join(", ")

        if (playIcon && pauseIcon) {
          playIcon.style.display = "none"
          pauseIcon.style.display = "block"
        }
      }
    })
  }

  onClick(event: MouseEvent) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera)

    // We need to manually check intersections because positions are computed in the shader
    // Get the initial positions attribute
    const initialPositions = this.geometry.getAttribute('aInitialPosition') as THREE.BufferAttribute
    const meshSpeeds = this.geometry.getAttribute('aMeshSpeed') as THREE.BufferAttribute
    
    if (!initialPositions || !meshSpeeds) {
      return
    }

    const time = this.material.uniforms.uTime.value
    const maxX = this.shaderParameters.maxX
    const maxY = this.shaderParameters.maxY
    const dragX = this.drag.xCurrent
    const dragY = this.drag.yCurrent
    const scrollY = this.scrollY.current
    
    const maxZ = 12
    const minZ = -30
    
    // Plane dimensions (from createGeometry: 1 * 2 = 2 width, 1.69 * 2 = 3.38 height)
    const planeHalfWidth = 1
    const planeHalfHeight = 1.69

    let closestInstance = -1
    let closestDistance = Infinity
    
    const ray = this.raycaster.ray
    const tempVec = new THREE.Vector3()
    const planeNormal = new THREE.Vector3(0, 0, 1)
    
    for (let i = 0; i < this.meshCount; i++) {
      // Get initial position
      const initX = initialPositions.getX(i)
      const initY = initialPositions.getY(i)
      const initZ = initialPositions.getZ(i)
      const meshSpeed = meshSpeeds.getX(i)
      
      // Compute displacement (matching shader logic)
      const maxYoffset = Math.abs(initY - maxY)
      const minYoffset = Math.abs(initY - (-maxY))
      const maxXoffset = Math.abs(initX - maxX)
      const minXoffset = Math.abs(initX - (-maxX))
      
      // mod function that matches GLSL
      const mod = (a: number, b: number) => ((a % b) + b) % b
      
      const xDisplacement = mod(minXoffset - dragX + time * meshSpeed, maxXoffset + minXoffset) - minXoffset
      const yDisplacement = mod(minYoffset - dragY, maxYoffset + minYoffset) - minYoffset
      
      const maxZoffset = Math.abs(initZ - maxZ)
      const minZoffset = Math.abs(initZ - minZ)
      const zDisplacement = mod(scrollY + minZoffset, maxZoffset + minZoffset) - minZoffset
      
      // Final position
      const posX = initX + xDisplacement
      const posY = initY + yDisplacement
      const posZ = initZ + zDisplacement
      
      // Only consider planes in front of camera (z < camera.position.z)
      if (posZ >= (this.camera as THREE.PerspectiveCamera).position.z) continue
      
      // Ray-plane intersection
      // Plane equation: point on plane is (posX, posY, posZ), normal is (0, 0, 1)
      const denom = ray.direction.dot(planeNormal)
      if (Math.abs(denom) < 0.0001) continue // Ray parallel to plane
      
      tempVec.set(posX, posY, posZ).sub(ray.origin)
      const t = tempVec.dot(planeNormal) / denom
      
      if (t < 0) continue // Behind ray origin
      
      // Get intersection point
      const hitX = ray.origin.x + ray.direction.x * t
      const hitY = ray.origin.y + ray.direction.y * t
      
      // Check if hit is within plane bounds
      if (Math.abs(hitX - posX) <= planeHalfWidth && Math.abs(hitY - posY) <= planeHalfHeight) {
        if (t < closestDistance) {
          closestDistance = t
          closestInstance = i
        }
      }
    }
    
    if (closestInstance >= 0) {
      // Get the album index (each album repeats in the instanced mesh)
      const albumIndex = closestInstance % this.imageInfos.length
      
      // Play or pause the track
      this.spotifyPlayer.playTrack(albumIndex)
      
      // Update active album for glow effect
      this.activeAlbumIndex = albumIndex
      this.material.uniforms.uActiveAlbum.value = albumIndex
    }
  }

  bindDrag(element: HTMLElement) {
    this.dragElement = element

    const onPointerDown = (e: PointerEvent) => {
      this.drag.isDown = true
      this.drag.startX = e.clientX
      this.drag.startY = e.clientY
      this.drag.lastX = e.clientX
      this.drag.lastY = e.clientY
      element.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!this.drag.isDown) return
      const dx = e.clientX - this.drag.lastX
      const dy = e.clientY - this.drag.lastY
      this.drag.lastX = e.clientX
      this.drag.lastY = e.clientY

      // Convert pixels to world units proportionally to viewport size
      const worldPerPixelX =
        (this.sizes.width / window.innerWidth) * this.dragSensitivity
      const worldPerPixelY =
        (this.sizes.height / window.innerHeight) * this.dragSensitivity

      this.drag.xTarget += -dx * worldPerPixelX
      this.drag.yTarget += dy * worldPerPixelY
    }

    const onPointerUp = (e: PointerEvent) => {
      this.drag.isDown = false
      try {
        element.releasePointerCapture(e.pointerId)
      } catch {}
    }

    const onClick = (e: MouseEvent) => {
      // Only trigger click if there was minimal movement
      const dx = Math.abs(e.clientX - this.drag.startX)
      const dy = Math.abs(e.clientY - this.drag.startY)
      
      if (dx < 5 && dy < 5) {
        this.onClick(e)
      }
    }

    element.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    element.addEventListener("click", onClick)
  }

  onWheel(event: WheelEvent) {
    const normalizedWheel = normalizeWheel(event)

    let scrollY =
      (normalizedWheel.pixelY * this.sizes.height) / window.innerHeight

    this.scrollY.target += scrollY

    this.material.uniforms.uSpeedY.value += scrollY
    
    // Zoom toward mouse position
    // Get mouse position in normalized coordinates (-1 to 1)
    const mouseNormX = (event.clientX / window.innerWidth) * 2 - 1
    const mouseNormY = -((event.clientY / window.innerHeight) * 2 - 1)
    
    // Convert to world space offset from center
    const mouseWorldX = mouseNormX * (this.sizes.width / 2)
    const mouseWorldY = mouseNormY * (this.sizes.height / 2)
    
    // When zooming in (positive scrollY), shift toward mouse position
    // When zooming out (negative scrollY), shift away from mouse position
    // The factor controls how strongly the zoom follows the mouse
    const zoomFactor = 0.15
    
    this.drag.xTarget += mouseWorldX * scrollY * zoomFactor
    this.drag.yTarget += -mouseWorldY * scrollY * zoomFactor
  }

  render(delta: number) {
    this.material.uniforms.uTime.value += delta * 0.015

    // Smoothly interpolate current drag towards target
    this.drag.xCurrent +=
      (this.drag.xTarget - this.drag.xCurrent) * this.dragDamping
    this.drag.yCurrent +=
      (this.drag.yTarget - this.drag.yCurrent) * this.dragDamping

    this.material.uniforms.uDrag.value.set(
      this.drag.xCurrent,
      this.drag.yCurrent
    )

    this.scrollY.current = interpolate(
      this.scrollY.current,
      this.scrollY.target,
      0.12
    )

    this.material.uniforms.uScrollY.value = this.scrollY.current

    this.material.uniforms.uSpeedY.value *= 0.835

    // Update glow intensity for pulsing effect
    if (this.activeAlbumIndex >= 0) {
      const pulseSpeed = 3.0
      const glowIntensity = 0.3 + 0.2 * Math.sin(this.material.uniforms.uTime.value * pulseSpeed)
      this.material.uniforms.uGlowIntensity.value = glowIntensity
    }
  }
}

const interpolate = (current: number, target: number, ease: number) => {
  return current + (target - current) * ease
}
