// D:\web\server\server.js
const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();

// RENDER REQUIREMENT: Port must be dynamic
const PORT = process.env.PORT || 3000;

// আপনার API Key সরাসরি কোডে
const YOUTUBE_API_KEY = 'AIzaSyCU3BJmLZY_E_1F_whPvcctSbw0GiqVy_U';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

console.log('===================================');
console.log('🚀 YT2 Server Starting...');
console.log('🔑 API Key:', YOUTUBE_API_KEY.substring(0, 15) + '...');
console.log('===================================');

// Middleware
// CORS update: Production e jate shob jayga theke request ashte pare
app.use(cors()); 
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Cache for search results
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Helper functions
function formatDuration(isoDuration) {
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '0:00';
    
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    
    if (hours) {
        return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
    }
    return `${minutes || '0'}:${seconds.padStart(2, '0')}`;
}

function formatViewCount(count) {
    if (!count) return 'No views';
    const num = parseInt(count);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M views`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K views`;
    return `${num} views`;
}

// Search endpoint
app.get('/api/search', async (req, res) => {
    try {
        const { q, maxResults = 20, pageToken } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        console.log('🔍 Searching YouTube for:', q);
        
        const cacheKey = `${q}-${maxResults}-${pageToken || ''}`;
        const cached = searchCache.get(cacheKey);
        if (cached && cached.timestamp > Date.now() - CACHE_TTL) {
            console.log('📦 Returning cached results');
            return res.json(cached.data);
        }
        
        const searchResponse = await axios.get(`${YOUTUBE_API_BASE}/search`, {
            params: {
                part: 'snippet',
                q,
                maxResults,
                type: 'video',
                key: YOUTUBE_API_KEY,
                pageToken
            }
        });
        
        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
            return res.json({ items: [] });
        }
        
        const videoIds = searchResponse.data.items.map(item => item.id.videoId).join(',');
        
        const detailsResponse = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
            params: {
                part: 'contentDetails,statistics',
                id: videoIds,
                key: YOUTUBE_API_KEY
            }
        });
        
        const items = searchResponse.data.items.map(item => {
            const details = detailsResponse.data.items.find(d => d.id === item.id.videoId);
            return {
                ...item,
                duration: details ? formatDuration(details.contentDetails.duration) : 'LIVE',
                viewCount: details ? formatViewCount(details.statistics.viewCount) : 'No views'
            };
        });
        
        const responseData = {
            items,
            nextPageToken: searchResponse.data.nextPageToken,
            prevPageToken: searchResponse.data.prevPageToken,
            pageInfo: searchResponse.data.pageInfo
        };
        
        searchCache.set(cacheKey, {
            timestamp: Date.now(),
            data: responseData
        });
        
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Search error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to search videos' });
    }
});

// Get video info endpoint
app.get('/api/info', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || !ytdl.validateID(id)) {
            return res.status(400).json({ error: 'Valid Video ID is required' });
        }
        
        const info = await ytdl.getInfo(id);
        const formats = info.formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel || format.quality,
            container: format.container,
            size: format.contentLength ? `${(parseInt(format.contentLength) / (1024 * 1024)).toFixed(2)} MB` : 'unknown',
            hasAudio: format.hasAudio,
            hasVideo: format.hasVideo
        }));
        
        res.json({
            title: info.videoDetails.title,
            channel: info.videoDetails.author.name,
            duration: parseInt(info.videoDetails.lengthSeconds),
            thumbnails: info.videoDetails.thumbnails,
            viewCount: info.videoDetails.viewCount,
            formats: Array.from(new Map(formats.map(f => [f.itag, f])).values())
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    try {
        const { id, itag } = req.query;
        if (!id || !itag) return res.status(400).json({ error: 'ID and itag required' });
        
        const info = await ytdl.getInfo(id);
        const format = info.formats.find(f => f.itag == itag);
        
        const sanitizedTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.${format.container}"`);
        
        ytdl(id, { format }).pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server: IMPORTANT - IP '0.0.0.0' and PORT variable
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ YT2 Server is running on port ${PORT}`);
    console.log(`📡 API Link: https://flybee.onrender.com/api`);
});

// Cleanup cache
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
        if (value.timestamp < now - CACHE_TTL) searchCache.delete(key);
    }
}, CACHE_TTL);
