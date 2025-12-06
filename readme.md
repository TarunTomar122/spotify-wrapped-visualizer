# Spotify Wrapped 2025 — Tarat

A 3D interactive visualization of my top 100 songs on Spotify in 2025. Built with Three.js and WebGL shaders.

![Preview](https://spotify-visualiser-three.vercel.app)

## Features

- 🎵 **Interactive 3D gallery** — Navigate through floating album covers
- 🖱️ **Drag to explore** — Pan around the infinite canvas
- 🔍 **Zoom to mouse** — Scroll to zoom toward your cursor position
- 🎧 **Click to play** — Click any album to play the track via Spotify
- ✨ **Smooth animations** — GPU-powered shader effects

## Tech Stack

- **Three.js** — 3D rendering
- **GLSL Shaders** — Custom vertex/fragment shaders for positioning and effects
- **Spotify Embed API** — For track playback
- **Vite** — Build tool
- **TypeScript**

## Credits

Most of the WebGL/Three.js visualization code is adapted from [J0SUKE/spotify-visualiser](https://github.com/J0SUKE/spotify-visualiser) — huge thanks for the amazing work! 🙏

I added:
- Spotify playback integration
- Custom raycasting for shader-positioned instanced meshes
- Zoom-to-mouse functionality
- Loading screen & branding

## Setup

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Customizing for Your Own Data

1. Replace images in `public/my-covers/` with your album art (named `cover_0.jpg` to `cover_99.jpg`)
2. Update `public/spotify-2025-data.json` with your track data
3. Update branding in `index.html`

## License

MIT

---

Made with ☕ by [Tarat](https://tarat.space)

