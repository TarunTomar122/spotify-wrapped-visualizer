import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envFile = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  
  envFile.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      env[key.trim()] = values.join('=').trim();
    }
  });
  
  return env;
}

// Get Spotify access token
async function getAccessToken(clientId, clientSecret) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  
  const data = await response.json();
  return data.access_token;
}

// Extract playlist ID from URL
function extractPlaylistId(url) {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Fetch playlist tracks
async function getPlaylistTracks(playlistId, accessToken) {
  let allTracks = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    const data = await response.json();
    
    // Debug output
    if (data.error) {
      console.error('❌ Spotify API Error:', data.error);
      throw new Error(`Spotify API Error: ${data.error.message}`);
    }
    
    if (!data.items || data.items.length === 0) {
      break;
    }
    
    allTracks = allTracks.concat(data.items);
    
    if (!data.next) {
      break;
    }
    
    offset += limit;
    console.log(`Fetched ${allTracks.length} tracks so far...`);
  }
  
  return allTracks;
}

// Get artist details including genres
async function getArtistDetails(artistIds, accessToken) {
  const chunks = [];
  for (let i = 0; i < artistIds.length; i += 50) {
    chunks.push(artistIds.slice(i, i + 50));
  }
  
  const allArtists = [];
  for (const chunk of chunks) {
    const response = await fetch(
      `https://api.spotify.com/v1/artists?ids=${chunk.join(',')}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    const data = await response.json();
    allArtists.push(...data.artists);
  }
  
  return allArtists;
}

// Download image
async function downloadImage(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
}

// Main function
async function main() {
  console.log('🎵 Fetching your Spotify 2025 Top Songs...\n');
  
  // Load environment variables
  const env = loadEnv();
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env file');
    process.exit(1);
  }
  
  // Get access token
  console.log('🔑 Getting access token...');
  const accessToken = await getAccessToken(clientId, clientSecret);
  console.log('✅ Access token obtained\n');
  
  // Extract playlist ID
  const playlistUrl = 'https://open.spotify.com/playlist/0GaQQiZbwlI23PaQ7Dpway?si=e782c83d98104d1f';
  const playlistId = extractPlaylistId(playlistUrl);
  console.log(`📋 Playlist ID: ${playlistId}\n`);
  
  // Fetch all tracks
  console.log('🎼 Fetching playlist tracks...');
  const tracks = await getPlaylistTracks(playlistId, accessToken);
  console.log(`✅ Fetched ${tracks.length} tracks\n`);
  
  // Get unique artist IDs for genre fetching
  console.log('🎤 Fetching artist details for genres...');
  const artistIds = [...new Set(tracks.flatMap(item => 
    item.track?.artists?.map(artist => artist.id).filter(Boolean) || []
  ))];
  const artists = await getArtistDetails(artistIds, accessToken);
  const artistMap = Object.fromEntries(artists.map(a => [a.id, a]));
  console.log('✅ Artist details fetched\n');
  
  // Process tracks
  console.log('📝 Processing track data...');
  const processedTracks = tracks
    .filter(item => item.track) // Filter out null tracks
    .map((item, index) => {
      const track = item.track;
      const albumImage = track.album.images[0]?.url || null;
      const albumImage640 = track.album.images.find(img => img.height === 640)?.url || track.album.images[0]?.url;
      
      // Collect genres from all artists
      const genres = [...new Set(
        track.artists.flatMap(artist => artistMap[artist.id]?.genres || [])
      )];
      
      return {
        position: index + 1,
        trackName: track.name,
        trackId: track.id,
        trackUrl: track.external_urls.spotify,
        artists: track.artists.map(a => ({
          name: a.name,
          id: a.id,
          url: a.external_urls.spotify
        })),
        albumName: track.album.name,
        albumId: track.album.id,
        albumUrl: track.album.external_urls.spotify,
        albumImage: albumImage,
        albumImage640: albumImage640,
        releaseDate: track.album.release_date,
        duration: track.duration_ms,
        explicit: track.explicit,
        popularity: track.popularity,
        genres: genres,
        previewUrl: track.preview_url
      };
    });
  
  console.log('✅ Track data processed\n');
  
  // Save to JSON
  const outputPath = path.join(__dirname, 'spotify-2025-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(processedTracks, null, 2));
  console.log(`💾 Data saved to: spotify-2025-data.json`);
  console.log(`   Total tracks: ${processedTracks.length}\n`);
  
  // Download album covers
  console.log('🖼️  Downloading album covers...');
  const coversDir = path.join(__dirname, 'public', 'my-covers');
  if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir, { recursive: true });
  }
  
  for (let i = 0; i < processedTracks.length; i++) {
    const track = processedTracks[i];
    if (track.albumImage640) {
      try {
        const filepath = path.join(coversDir, `cover_${i}.jpg`);
        await downloadImage(track.albumImage640, filepath);
        if ((i + 1) % 10 === 0) {
          console.log(`   Downloaded ${i + 1}/${processedTracks.length} covers...`);
        }
      } catch (error) {
        console.error(`   Failed to download cover for: ${track.trackName}`);
      }
    }
  }
  
  console.log(`✅ Downloaded ${processedTracks.length} album covers to public/my-covers/\n`);
  
  // Print summary
  console.log('📊 Summary:');
  console.log(`   Total tracks: ${processedTracks.length}`);
  console.log(`   Unique artists: ${artistIds.length}`);
  console.log(`   Unique albums: ${[...new Set(processedTracks.map(t => t.albumId))].length}`);
  console.log(`   Total genres: ${[...new Set(processedTracks.flatMap(t => t.genres))].length}`);
  console.log('\n🎉 Done! Your Spotify 2025 data is ready!');
}

main().catch(console.error);

