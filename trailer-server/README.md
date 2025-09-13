# Nuvio Trailer Server

A Node.js server that converts YouTube trailer URLs to direct streaming links using yt-dlp.

## Features

- 🎬 Convert YouTube URLs to direct streaming links
- 💾 Intelligent caching (24-hour TTL)
- 🚦 Rate limiting (10 requests/minute per IP)
- 🔒 Security headers with Helmet
- 📊 Health monitoring endpoint
- 🧪 Built-in testing suite

## Prerequisites

- Node.js 16+ 
- yt-dlp installed on your system

### Install yt-dlp

**macOS:**
```bash
brew install yt-dlp
```

**Linux:**
```bash
pip install yt-dlp
```

**Windows:**
```bash
pip install yt-dlp
```

## Installation

1. **Clone/Navigate to the server directory:**
```bash
cd trailer-server
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start the server:**
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### GET /health
Health check endpoint
```bash
curl http://localhost:3001/health
```

### GET /trailer
Get direct streaming URL for a YouTube trailer

**Parameters:**
- `youtube_url` (required): YouTube URL of the trailer
- `title` (optional): Movie/show title
- `year` (optional): Release year

**Example:**
```bash
curl "http://localhost:3001/trailer?youtube_url=https://www.youtube.com/watch?v=example&title=Avengers&year=2019"
```

**Response:**
```json
{
  "url": "https://direct-streaming-url.com/video.mp4",
  "title": "Avengers",
  "year": "2019",
  "source": "youtube",
  "cached": false,
  "timestamp": "2023-12-01T10:00:00.000Z"
}
```

### GET /cache
View cached trailers (for debugging)

### DELETE /cache
Clear all cached trailers

## Testing

Run the test suite:
```bash
npm test
```

This will test:
- Health endpoint
- Trailer fetching
- Cache functionality
- Rate limiting

## Integration with Nuvio App

Update your `TrailerService.ts` to use the local server:

```typescript
// In src/services/trailerService.ts
export class TrailerService {
  private static readonly BASE_URL = 'http://localhost:3001/trailer';
  
  static async getTrailerUrl(title: string, year: number): Promise<string | null> {
    try {
      // You'll need to find the YouTube URL first
      const youtubeUrl = await this.findYouTubeTrailer(title, year);
      if (!youtubeUrl) return null;
      
      const response = await fetch(
        `${this.BASE_URL}?youtube_url=${encodeURIComponent(youtubeUrl)}&title=${encodeURIComponent(title)}&year=${year}`
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      return data.url;
    } catch (error) {
      logger.error('TrailerService', 'Error fetching trailer:', error);
      return null;
    }
  }
}
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)

## Deployment

### Netlify Functions
1. Create `netlify/functions/trailer.js`
2. Adapt the server code for serverless
3. Deploy to Netlify

### Vercel
1. Create `api/trailer.js`
2. Adapt for Vercel's serverless functions
3. Deploy to Vercel

### Railway/Render
1. Push to GitHub
2. Connect to Railway/Render
3. Set environment variables
4. Deploy

## Troubleshooting

**yt-dlp not found:**
- Ensure yt-dlp is installed and in PATH
- Try: `which yt-dlp` to verify installation

**Rate limited:**
- Wait 1 minute or clear cache
- Check rate limiting settings

**Trailer not found:**
- Verify YouTube URL is valid
- Check if video is available in your region
- Try different quality settings

## License

MIT
