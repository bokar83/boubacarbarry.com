// Detected: Static HTML site served via Node http server with vanilla JS utilities
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf'
};

function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /(?:v=)([\w-]{11})/, // standard query param
    /youtu\.be\/([\w-]{11})/, // short link
    /youtube\.com\/embed\/([\w-]{11})/ // embed
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function fetchTranscript(videoId) {
  // Uses the publicly accessible youtubetranscript.com endpoint (free) to retrieve transcript JSON
  // Example: https://youtubetranscript.com/?format=json&lang=en&v=<VIDEO_ID>
  const upstreamUrl = `https://youtubetranscript.com/?format=json&lang=en&v=${videoId}`;

  return new Promise((resolve, reject) => {
    const request = https.get(
      upstreamUrl,
      {
        headers: {
          // Some free endpoints require a User-Agent to avoid being blocked by anti-bot filters
          'User-Agent': 'Mozilla/5.0 (compatible; TranscriptFetcher/1.0)'
        }
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');

          if (res.statusCode && res.statusCode >= 400) {
            const reason = raw || `Upstream responded with status ${res.statusCode}`;
            reject(new Error(reason));
            return;
          }

          try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
              reject(new Error('No transcript available for this video.'));
              return;
            }

            const transcriptText = parsed
              .map((entry) => entry.text)
              .filter(Boolean)
              .join(' ')
              .trim();

            if (!transcriptText) {
              reject(new Error('Transcript returned empty content.'));
              return;
            }

            resolve(transcriptText);
          } catch (err) {
            reject(new Error('Unable to parse transcript content'));
          }
        });
      }
    );

    request.on('error', (err) => reject(err));
  });
}

function serveStatic(req, res) {
  const rawPath = decodeURIComponent(req.url.split('?')[0].split('#')[0] || '/');
  const normalized = path
    .normalize(rawPath)
    .replace(/^\/+/, '')
    .replace(/^\.\.(\/|\\|$)/, '');

  let finalPath = path.join(__dirname, normalized);

  try {
    const stats = fs.existsSync(finalPath) ? fs.statSync(finalPath) : null;
    if (stats && stats.isDirectory()) {
      finalPath = path.join(finalPath, 'index.html');
    }
  } catch (err) {
    // noop, handled below
  }

  // If the path resolves outside the project root, reject the request
  const resolved = path.resolve(finalPath);
  const root = path.resolve(__dirname);
  if (!resolved.startsWith(root)) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  const ext = path.extname(finalPath) || '.html';
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(finalPath, (err, data) => {
    if (err) {
      if (ext !== '.html') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      // attempt to fallback to index.html
      fs.readFile(path.join(__dirname, 'index.html'), (fallbackErr, fallbackData) => {
        if (fallbackErr) {
          res.writeHead(500);
          res.end('Server error');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fallbackData);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/youtube-transcript') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) req.connection.destroy();
    });

    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const videoId = extractVideoId(parsed.url);
        if (!videoId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid YouTube URL' }));
          return;
        }

        try {
          const transcriptText = await fetchTranscript(videoId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ transcript: transcriptText }));
        } catch (fetchErr) {
          const fallbackMessage =
            'Transcript service is currently unavailable. Please try again later or copy captions directly from YouTube.';
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: fetchErr?.message || fallbackMessage }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request payload' }));
      }
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
