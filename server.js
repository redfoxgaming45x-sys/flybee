// D:\web\server\server.js
const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// আপনার API Key সরাসরি কোডে
const YOUTUBE_API_KEY = 'AIzaSyCU3BJmLZY_E_1F_whPvcctSbw0GiqVy_U';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

console.log('===================================');
console.log('🚀 YT2 Server Starting...');
console.log('🔑 API Key:', YOUTUBE_API_KEY.substring(0, 15) + '...');
console.log('===================================');

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
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
        
        // Check cache
        const cacheKey = `${q}-${maxResults}-${pageToken || ''}`;
        const cached = searchCache.get(cacheKey);
        if (cached && cached.timestamp > Date.now() - CACHE_TTL) {
            console.log('📦 Returning cached results');
            return res.json(cached.data);
        }
        
        // Search videos from YouTube
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
            console.log('⚠️ No results found');
            return res.json({ items: [] });
        }
        
        const videoIds = searchResponse.data.items.map(item => item.id.videoId).join(',');
        
        // Get video details
        const detailsResponse = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
            params: {
                part: 'contentDetails,statistics',
                id: videoIds,
                key: YOUTUBE_API_KEY
            }
        });
        
        // Combine data
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
        
        // Cache the result
        searchCache.set(cacheKey, {
            timestamp: Date.now(),
            data: responseData
        });
        
        console.log('✅ Found', items.length, 'videos');
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Search error:', error.response?.data || error.message);
        
        if (error.response?.status === 403) {
            return res.status(403).json({ 
                error: 'YouTube API key invalid or expired',
                details: 'Please check your API key in Google Cloud Console'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to search videos',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

// Get video info endpoint
app.get('/api/info', async (req, res) => {
    try {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).json({ error: 'Video ID is required' });
        }
        
        if (!ytdl.validateID(id)) {
            return res.status(400).json({ error: 'Invalid video ID' });
        }
        
        console.log('📹 Getting info for video:', id);
        
        // Use more options for ytdl to avoid some errors
        const info = await ytdl.getInfo(id);
        
        const formats = info.formats.map(format => {
            let qualityLabel = format.qualityLabel || format.quality;
            
            // Check if it's high resolution
            const isHighRes = qualityLabel && (qualityLabel.includes('1080') || qualityLabel.includes('1440') || qualityLabel.includes('2160') || qualityLabel.includes('4320'));
            const hasAudio = !!format.hasAudio;
            const hasVideo = !!format.hasVideo;

            return {
                itag: format.itag,
                quality: qualityLabel,
                container: format.container,
                size: format.contentLength ? 
                    `${(parseInt(format.contentLength) / (1024 * 1024)).toFixed(2)} MB` : 
                    'unknown',
                hasAudio,
                hasVideo,
                isHighRes,
                label: `${qualityLabel}${!hasAudio ? ' (No Audio)' : ''}${!hasVideo ? ' (Audio Only)' : ''}`
            };
        });
        
        // Sort and filter formats
        const uniqueFormats = formats.sort((a, b) => {
            const aQ = parseInt(a.quality) || 0;
            const bQ = parseInt(b.quality) || 0;
            if (bQ !== aQ) return bQ - aQ;
            return (b.hasAudio && b.hasVideo) ? 1 : -1;
        });
        
        res.json({
            title: info.videoDetails.title,
            channel: info.videoDetails.author.name,
            duration: parseInt(info.videoDetails.lengthSeconds),
            thumbnails: info.videoDetails.thumbnails,
            viewCount: info.videoDetails.viewCount,
            likes: info.videoDetails.likes,
            description: info.videoDetails.description,
            publishDate: info.videoDetails.publishDate,
            subscriberCount: info.videoDetails.author.subscriber_count,
            formats: uniqueFormats
        });
        
    } catch (error) {
        console.error('❌ Info error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch video info',
            details: error.message
        });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    try {
        const { id, itag } = req.query;
        
        if (!id || !itag) {
            return res.status(400).json({ error: 'Video ID and itag are required' });
        }
        
        if (!ytdl.validateID(id)) {
            return res.status(400).json({ error: 'Invalid video ID' });
        }
        
        console.log('⬇️ Downloading video:', id, 'itag:', itag);
        
        const info = await ytdl.getInfo(id);
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) {
            return res.status(404).json({ error: 'Format not found' });
        }
        
        const sanitizedTitle = info.videoDetails.title
            .replace(/[^\w\s]/gi, '')
            .replace(/\s+/g, '_')
            .substring(0, 100);
        
        const filename = `${sanitizedTitle}.${format.container || 'mp4'}`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', format.mimeType || 'video/mp4');
        if (format.contentLength) {
            res.setHeader('Content-Length', format.contentLength);
        }
        
        const stream = ytdl(id, { 
            format,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).send('Download failed');
            }
        });

        stream.pipe(res);
        
    } catch (error) {
        console.error('❌ Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed', details: error.message });
        }
    }
});

// Stream endpoint for custom player
app.get('/api/stream/:videoId', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const { itag } = req.query;
        
        if (!ytdl.validateID(videoId)) {
            return res.status(400).json({ error: 'Invalid video ID' });
        }
        
        console.log('🎬 Streaming video:', videoId);
        
        const info = await ytdl.getInfo(videoId);
        
        let format;
        if (itag) {
            format = info.formats.find(f => f.itag == itag);
        } else {
            format = ytdl.chooseFormat(info.formats, { 
                quality: '18',
                filter: 'audioandvideo' 
            });
        }
        
        if (!format) {
            return res.status(404).json({ error: 'No playable format found' });
        }
        
        res.setHeader('Content-Type', format.mimeType || 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : undefined;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end || ''}/*`);
        }
        
        const stream = ytdl(videoId, { format });
        
        stream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed' });
            }
        });
        
        stream.pipe(res);
        
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ error: 'Failed to stream video' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: true
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n✅ YT2 Server is running!');
    console.log('📡 API: http://localhost:' + PORT + '/api');
    console.log('💚 Health: http://localhost:' + PORT + '/api/health');
    console.log('🔑 API Key: ✅ Configured (Real YouTube Data)');
    console.log('\n💡 Test search: http://localhost:3000/api/search?q=bulleya\n');
});

// Cleanup cache periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
        if (value.timestamp < now - CACHE_TTL) {
            searchCache.delete(key);
        }
    }
}, CACHE_TTL);
