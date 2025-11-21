// Detected: Static HTML + vanilla JS for YouTube transcript requests
(function() {
  const urlInput = document.getElementById('youtube-url');
  const fetchBtn = document.getElementById('fetch-btn');
  const statusEl = document.getElementById('status');
  const transcriptEl = document.getElementById('transcript');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');

  function setStatus(message, variant = 'idle') {
    statusEl.textContent = message;
    statusEl.classList.remove('error', 'success');
    if (variant === 'error') statusEl.classList.add('error');
    if (variant === 'success') statusEl.classList.add('success');
  }

  function extractVideoId(url) {
    if (!url) return null;
    const patterns = [/(?:v=)([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /youtube\.com\/embed\/([\w-]{11})/];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  async function fetchTranscript() {
    const url = (urlInput.value || '').trim();
    if (!url) {
      setStatus('Please paste a YouTube link.', 'error');
      urlInput.focus();
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      setStatus('That does not look like a valid YouTube URL.', 'error');
      return;
    }

    setStatus('Loading transcript…');
    transcriptEl.textContent = '';
    try {
      const response = await fetch('/api/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Unable to fetch transcript.');
      }

      const text = (payload.transcript || '').trim();
      if (!text) {
        setStatus('No transcript available for this video.', 'error');
        transcriptEl.textContent = 'No transcript available for this video.';
        return;
      }

      transcriptEl.textContent = text;
      setStatus('Transcript loaded.', 'success');
    } catch (err) {
      console.error(err);
      const fallback =
        'Transcript service is currently unavailable. Please try again later or copy captions directly from YouTube.';
      setStatus(err.message || fallback, 'error');
      transcriptEl.textContent = err.message || fallback;
    }
  }

  async function copyTranscript() {
    const text = transcriptEl.textContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Transcript copied to clipboard.', 'success');
    } catch (err) {
      setStatus('Unable to copy. Please copy manually.', 'error');
    }
  }

  function downloadTranscript() {
    const text = transcriptEl.textContent.trim();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-transcript.txt';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Transcript downloaded.', 'success');
  }

  fetchBtn?.addEventListener('click', fetchTranscript);
  copyBtn?.addEventListener('click', copyTranscript);
  downloadBtn?.addEventListener('click', downloadTranscript);
  urlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchTranscript();
    }
  });
})();
