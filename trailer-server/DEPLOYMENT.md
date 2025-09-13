# 🚀 Deployment Guide

## Netlify Deployment

### Option 1: Deploy via Netlify CLI

1. **Install Netlify CLI:**
```bash
npm install -g netlify-cli
```

2. **Login to Netlify:**
```bash
netlify login
```

3. **Deploy:**
```bash
netlify deploy --prod --dir=.
```

### Option 2: Deploy via GitHub

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial trailer server"
git remote add origin https://github.com/yourusername/nuvio-trailer-server.git
git push -u origin main
```

2. **Connect to Netlify:**
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Connect your GitHub repository
   - Build settings will be auto-detected from `netlify.toml`

### Option 3: Manual Deploy

1. **Build the functions:**
```bash
npm run build
```

2. **Upload to Netlify:**
   - Zip the entire folder
   - Upload via Netlify dashboard

## Important Notes

### ⚠️ yt-dlp Limitation
**Netlify Functions don't support yt-dlp by default.** You have a few options:

1. **Use Railway/Render instead** (recommended)
2. **Use a different approach** (see alternatives below)
3. **Custom Netlify build** (complex)

### Alternative Platforms

#### Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### Render
1. Connect GitHub repository
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Deploy

#### Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

## Update Your App

After deployment, update your TrailerService:

```typescript
// In src/services/trailerService.ts
private static readonly LOCAL_SERVER_URL = 'https://your-deployed-url.netlify.app/trailer';
```

## Testing Deployment

```bash
# Test health endpoint
curl https://your-deployed-url.netlify.app/health

# Test trailer endpoint
curl "https://your-deployed-url.netlify.app/trailer?youtube_url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&title=Test&year=2023"
```

## Environment Variables

Set these in your deployment platform:

- `NODE_ENV`: `production`
- `PORT`: `3001` (if needed)

## Monitoring

- Check Netlify Functions dashboard for logs
- Monitor function execution time
- Watch for rate limiting issues

## Troubleshooting

### Common Issues:

1. **yt-dlp not found**: Use Railway/Render instead of Netlify
2. **Function timeout**: Increase timeout in platform settings
3. **Rate limiting**: Implement better caching
4. **CORS issues**: Check headers in functions

### Debug Commands:

```bash
# Test locally
npm test

# Check function logs
netlify functions:list
netlify functions:invoke trailer
```
