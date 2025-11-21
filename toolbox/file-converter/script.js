// Detected: Static HTML + vanilla JS for in-browser file conversion
(function() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const sourceTypeSelect = document.getElementById('source-type');
  const targetFormatSelect = document.getElementById('target-format');
  const convertBtn = document.getElementById('convert-btn');
  const statusEl = document.getElementById('convert-status');
  const resultMessage = document.getElementById('result-message');
  const downloadLink = document.getElementById('download-link');
  const formatNote = document.getElementById('format-note');

  const formatOptions = {
    text: [
      { value: 'txt-pdf', label: 'TXT → PDF' },
      { value: 'md-pdf', label: 'MD → PDF' }
    ],
    image: [
      { value: 'png-jpg', label: 'PNG → JPG' },
      { value: 'jpg-png', label: 'JPG → PNG' }
    ],
    audio: [
      { value: 'audio-coming', label: 'Audio conversions coming soon', disabled: true }
    ],
    video: [
      { value: 'video-coming', label: 'Video conversions coming soon', disabled: true }
    ]
  };

  let selectedFile = null;

  function setStatus(message, variant = 'idle') {
    statusEl.textContent = message;
    statusEl.classList.remove('error', 'success');
    if (variant === 'error') statusEl.classList.add('error');
    if (variant === 'success') statusEl.classList.add('success');
  }

  function updateFormats() {
    const type = sourceTypeSelect.value;
    targetFormatSelect.innerHTML = '';
    (formatOptions[type] || []).forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (opt.disabled) optionEl.disabled = true;
      targetFormatSelect.appendChild(optionEl);
    });
    showComingSoonIfNeeded();
  }

  function handleFile(file) {
    selectedFile = file;
    if (!file) {
      setStatus('Waiting for a file…');
      resultMessage.textContent = 'No conversion yet.';
      downloadLink.style.display = 'none';
      return;
    }
    setStatus(`${file.name} ready to convert.`);
  }

  function showComingSoonIfNeeded() {
    const type = sourceTypeSelect.value;
    if (type === 'audio' || type === 'video') {
      formatNote.style.display = 'block';
      formatNote.textContent =
        'Advanced audio and video conversions will be added in a future update.';
      setStatus('Previewing upcoming media conversions.', 'success');
    } else {
      formatNote.style.display = 'none';
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function sanitizeLine(line) {
    return line
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r?\n/g, ' ');
  }

  function markdownToPlain(text) {
    return text
      .replace(/^\s{0,3}#/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]\(([^)]*)\)/g, '$1')
      .replace(/>\s?/g, '')
      .trim();
  }

  function wrapLines(text, max = 90) {
    const lines = [];
    const rawLines = text.split(/\r?\n/);
    rawLines.forEach((rawLine) => {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push('');
        return;
      }
      let current = '';
      words.forEach((word) => {
        if ((current + ' ' + word).trim().length > max) {
          lines.push(current.trim());
          current = word;
        } else {
          current = `${current} ${word}`.trim();
        }
      });
      if (current) lines.push(current.trim());
    });
    return lines;
  }

  function chunkLines(lines, perPage = 42) {
    const chunks = [];
    for (let i = 0; i < lines.length; i += perPage) {
      chunks.push(lines.slice(i, i + perPage));
    }
    return chunks.length ? chunks : [[]];
  }

  function buildContentStream(lines) {
    const sanitized = lines.map((line) => sanitizeLine(line));
    const content = sanitized
      .map((line) => `(${line || ' '}) Tj T*`)
      .join(' ');
    return `BT /F1 12 Tf 14 TL 50 770 Td ${content} ET`;
  }

  function createPdfBlob(lines) {
    const pages = chunkLines(lines);
    const pageCount = pages.length;
    const pageObjStart = 3;
    const contentObjStart = pageObjStart + pageCount;
    const fontObjNum = contentObjStart + pageCount;

    const objects = new Map();
    objects.set(1, `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
    const kids = Array.from({ length: pageCount }, (_, i) => `${pageObjStart + i} 0 R`).join(' ');
    objects.set(2, `2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>\nendobj\n`);

    pages.forEach((linesForPage, index) => {
      const pageObjNum = pageObjStart + index;
      const contentObjNum = contentObjStart + index;
      const contentStream = buildContentStream(linesForPage);
      const length = new TextEncoder().encode(contentStream).length;
      objects.set(
        contentObjNum,
        `${contentObjNum} 0 obj\n<< /Length ${length} >>\nstream\n${contentStream}\nendstream\nendobj\n`
      );
      objects.set(
        pageObjNum,
        `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj\n`
      );
    });

    objects.set(fontObjNum, `${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

    const encoder = new TextEncoder();
    let pdfParts = ['%PDF-1.4\n'];
    const offsets = [0];
    let lengthSoFar = encoder.encode(pdfParts[0]).length;

    const keys = Array.from(objects.keys()).sort((a, b) => a - b);
    keys.forEach((key) => {
      offsets[key] = lengthSoFar;
      const fragment = objects.get(key);
      pdfParts.push(fragment);
      lengthSoFar += encoder.encode(fragment).length;
    });

    const xrefStart = lengthSoFar;
    let xref = `xref\n0 ${keys.length + 1}\n`;
    xref += '0000000000 65535 f \n';
    for (let i = 1; i <= keys.length + 0; i += 1) {
      const offset = offsets[i] || 0;
      xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    pdfParts.push(xref);

    const trailer = `trailer\n<< /Size ${keys.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    pdfParts.push(trailer);

    return new Blob(pdfParts, { type: 'application/pdf' });
  }

  async function convertText(file, mode) {
    const text = await readFileAsText(file);
    const normalized = mode === 'md-pdf' ? markdownToPlain(text) : text;
    const lines = wrapLines(normalized, 88);
    const pdfBlob = createPdfBlob(lines);
    const filename = file.name.replace(/\.[^.]+$/, '') + '.pdf';
    provideDownload(pdfBlob, filename);
  }

  async function convertImage(file, mode) {
    const dataUrl = await readFileAsDataUrl(file);
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const targetType = mode === 'png-jpg' ? 'image/jpeg' : 'image/png';
    const convertedUrl = canvas.toDataURL(targetType, 0.92);
    const blob = await (await fetch(convertedUrl)).blob();
    const extension = targetType === 'image/jpeg' ? '.jpg' : '.png';
    const filename = file.name.replace(/\.[^.]+$/, '') + extension;
    provideDownload(blob, filename);
  }

  function provideDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.style.display = 'inline-flex';
    resultMessage.textContent = `Ready: ${filename}`;
    setStatus('Conversion complete.', 'success');
  }

  async function convertFile() {
    if (!selectedFile) {
      setStatus('Please add a file first.', 'error');
      return;
    }

    const type = sourceTypeSelect.value;
    const mode = targetFormatSelect.value;

    if (type === 'audio' || type === 'video') {
      setStatus('Audio and video conversions are coming soon.', 'error');
      resultMessage.textContent = 'Media conversion is not available yet.';
      downloadLink.style.display = 'none';
      return;
    }

    try {
      setStatus('Converting…');
      resultMessage.textContent = 'Working on it…';
      downloadLink.style.display = 'none';

      if (type === 'text') {
        const ext = (selectedFile.name.split('.').pop() || '').toLowerCase();
        if (mode === 'txt-pdf' && ext !== 'txt') {
          setStatus('Please upload a .txt file for this conversion.', 'error');
          return;
        }
        if (mode === 'md-pdf' && ext !== 'md') {
          setStatus('Please upload a .md file for this conversion.', 'error');
          return;
        }
        await convertText(selectedFile, mode);
      } else if (type === 'image') {
        const ext = (selectedFile.name.split('.').pop() || '').toLowerCase();
        if (mode === 'png-jpg' && ext !== 'png') {
          setStatus('Upload a .png file to convert to .jpg.', 'error');
          return;
        }
        if (mode === 'jpg-png' && !['jpg', 'jpeg'].includes(ext)) {
          setStatus('Upload a .jpg or .jpeg file to convert to .png.', 'error');
          return;
        }
        await convertImage(selectedFile, mode);
      }
    } catch (err) {
      console.error(err);
      setStatus('Conversion failed. Large files may not work in the browser.', 'error');
      resultMessage.textContent = 'Conversion failed.';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const [file] = e.dataTransfer.files || [];
    handleFile(file);
  }

  function onBrowseClick() {
    fileInput.click();
  }

  dropzone?.addEventListener('click', onBrowseClick);
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onBrowseClick();
    }
  });
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', onDrop);

  fileInput?.addEventListener('change', (e) => {
    const [file] = e.target.files || [];
    handleFile(file);
  });

  sourceTypeSelect?.addEventListener('change', updateFormats);
  convertBtn?.addEventListener('click', convertFile);

  updateFormats();
  setStatus('Waiting for a file…');
})();
