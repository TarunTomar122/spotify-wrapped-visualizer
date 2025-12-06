export interface TrackData {
  position: number
  trackName: string
  trackId: string
  trackUrl: string
  artists: Array<{ name: string; id: string; url: string }>
  albumName: string
  albumId: string
  albumUrl: string
  albumImage: string
  albumImage640: string
  releaseDate: string
  duration: number
  explicit: boolean
  popularity: number
  genres: string[]
  previewUrl: string | null
}

export class SpotifyPlayer {
  private controller: any = null
  private currentTrackId: string | null = null
  private isPlaying: boolean = false
  private tracks: TrackData[] = []
  private embedElement: HTMLDivElement | null = null
  private onTrackChangeCallback: ((track: TrackData | null) => void) | null = null
  private spotifyAPIReady: boolean = false
  private spotifyAPIPromise: Promise<void> | null = null
  private controllerReady: boolean = false
  private controllerPromise: Promise<void> | null = null

  constructor() {
    this.loadTracks()
    this.createEmbedElement()
    this.initSpotifyAPI()
  }

  private initSpotifyAPI() {
    // Set up the callback that Spotify will call when ready
    this.spotifyAPIPromise = new Promise((resolve) => {
      // Check if already loaded
      if ((window as any).Spotify) {
        this.spotifyAPIReady = true
        resolve()
        this.preWarmController()
        return
      }

      // Set up callback for when Spotify loads
      (window as any).onSpotifyIframeApiReady = (IFrameAPI: any) => {
        ;(window as any).Spotify = IFrameAPI
        this.spotifyAPIReady = true
        resolve()
        this.preWarmController()
      }
    })
  }

  // Pre-initialize the controller so it's ready when user clicks
  private preWarmController() {
    const IFrameAPI = (window as any).Spotify
    if (!IFrameAPI || this.controller) return

    this.controllerPromise = new Promise((resolve) => {
      // Use first track to initialize (won't play, just warms up)
      const options = {
        uri: 'spotify:track:7qpZh0yIXeZzXZk3mE6Fj9', // First track ID
      }

      IFrameAPI.createController(this.embedElement, options, (controller: any) => {
        this.controller = controller
        
        controller.addListener("playback_update", (e: any) => {
          this.isPlaying = !e.data.isPaused
        })

        controller.addListener("ready", () => {
          this.controllerReady = true
          // Don't auto-play, just mark as ready
          controller.pause()
          resolve()
        })
      })
    })
  }

  private async loadTracks() {
    try {
      const response = await fetch("/spotify-2025-data.json")
      this.tracks = await response.json()
    } catch (error) {
      console.error("Failed to load track data:", error)
    }
  }

  private createEmbedElement() {
    this.embedElement = document.createElement("div")
    this.embedElement.id = "spotify-embed"
    this.embedElement.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 0px;
      height: 0px;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      z-index: -9999;
      overflow: hidden;
      clip-path: inset(100%);
    `
    document.body.appendChild(this.embedElement)
  }

  public onTrackChange(callback: (track: TrackData | null) => void) {
    this.onTrackChangeCallback = callback
  }

  public getTrackByIndex(index: number): TrackData | null {
    return this.tracks[index] || null
  }

  public async playTrack(albumIndex: number) {
    const track = this.getTrackByIndex(albumIndex)
    if (!track) return

    // If same track, toggle play/pause
    if (this.currentTrackId === track.trackId) {
      this.togglePlayPause()
      return
    }

    this.currentTrackId = track.trackId
    
    if (this.onTrackChangeCallback) {
      this.onTrackChangeCallback(track)
    }

    // Wait for controller to be pre-warmed
    if (this.controllerPromise) {
      await this.controllerPromise
    }
    
    // If controller is ready, just load the new track (fast!)
    if (this.controller && this.controllerReady) {
      this.controller.loadUri(`spotify:track:${track.trackId}`)
      this.controller.play()
      this.isPlaying = true
      return
    }

    // Fallback: wait for API and create controller
    if (!this.spotifyAPIReady && this.spotifyAPIPromise) {
      await this.spotifyAPIPromise
    }
    
    if (!(window as any).Spotify) return
    
    this.loadTrack(track.trackId)
  }

  private loadTrack(trackId: string) {
    const IFrameAPI = (window as any).Spotify
    if (!IFrameAPI) return

    if (this.controller) {
      this.controller.loadUri(`spotify:track:${trackId}`)
      this.controller.play()
      this.isPlaying = true
      return
    }

    const options = {
      uri: `spotify:track:${trackId}`,
    }

    IFrameAPI.createController(this.embedElement, options, (controller: any) => {
      this.controller = controller
      this.controllerReady = true

      controller.addListener("playback_update", (e: any) => {
        this.isPlaying = !e.data.isPaused
      })

      controller.addListener("ready", () => {
        controller.play()
        this.isPlaying = true
      })
    })
  }

  public togglePlayPause() {
    if (!this.controller) return

    if (this.isPlaying) {
      this.controller.pause()
      this.isPlaying = false
    } else {
      this.controller.play()
      this.isPlaying = true
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }

  public getCurrentTrack(): TrackData | null {
    if (!this.currentTrackId) return null
    return this.tracks.find((t) => t.trackId === this.currentTrackId) || null
  }
}

