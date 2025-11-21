// Detected: Static HTML + vanilla JS for live character counting
(function() {
  const input = document.getElementById('counter-input');
  const charsWithEl = document.getElementById('chars-with');
  const charsNoEl = document.getElementById('chars-no');
  const wordsEl = document.getElementById('words');
  const linesEl = document.getElementById('lines');

  function normalizeNewlines(text) {
    return text.replace(/\r\n?/g, '\n');
  }

  function countWords(text) {
    const matches = normalizeNewlines(text).match(/[\p{L}\p{N}'’\-]+/gu);
    return matches ? matches.length : 0;
  }

  function countLines(text) {
    if (!text) return 0;
    return normalizeNewlines(text).split('\n').length;
  }

  function updateCounts() {
    const value = input.value || '';
    charsWithEl.textContent = value.length;
    const withoutSpaces = value.replace(/\s/g, '');
    charsNoEl.textContent = withoutSpaces.length;
    wordsEl.textContent = countWords(value);
    linesEl.textContent = countLines(value);
  }

  input?.addEventListener('input', updateCounts);
  updateCounts();
})();
