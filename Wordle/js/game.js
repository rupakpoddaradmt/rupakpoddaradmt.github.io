/* ====================================================================
   Wordle clone - game logic
   Uses ANSWERS and VALID_GUESSES from words.js
   All state stored in localStorage. No network required.
==================================================================== */

(() => {
  'use strict';

  /* ---------- Constants ---------- */
  const ROWS = 6;
  const COLS = 5;
  // Anchor date for daily puzzle. Day 0 = this date. Use UTC for stability.
  // Choosing 2021-06-19 mirrors the original Wordle launch date so word #1 is "cigar".
  const EPOCH = Date.UTC(2021, 5, 19);
  const STORAGE_KEY = 'wordle.state.v1';
  const STATS_KEY = 'wordle.stats.v1';
  const SETTINGS_KEY = 'wordle.settings.v1';

  /* ---------- DOM refs ---------- */
  const boardEl = document.getElementById('board');
  const keyboardEl = document.getElementById('keyboard');
  const messageEl = document.getElementById('message');

  /* ---------- State ---------- */
  let state = null;     // current game state
  let stats = null;     // statistics
  let settings = null;  // user settings
  let isAnimating = false;

  /* ---------- Storage helpers ---------- */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { /* quota or private mode */ }
  }

  /* ---------- Daily word ---------- */
  function dayNumber(now = new Date()) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - EPOCH) / 86400000);
  }
  function dailyAnswer() {
    const d = dayNumber();
    // Modulo to wrap past the end of the list (this list only has ~2300 words)
    const idx = ((d % ANSWERS.length) + ANSWERS.length) % ANSWERS.length;
    return { word: ANSWERS[idx], dayNum: d };
  }
  function randomAnswer() {
    return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  }

  /* ---------- Settings ---------- */
  function defaultSettings() {
    const prefersDark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      hardMode: false,
      darkTheme: prefersDark,
      contrast: false,
      practice: false,
    };
  }
  function applySettings() {
    document.body.classList.toggle('dark', !!settings.darkTheme);
    document.body.classList.toggle('contrast', !!settings.contrast);
    document.body.classList.toggle('practice', !!settings.practice);
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', settings.darkTheme ? '#121213' : '#ffffff');

    document.getElementById('set-hard').checked = !!settings.hardMode;
    document.getElementById('set-dark').checked = !!settings.darkTheme;
    document.getElementById('set-contrast').checked = !!settings.contrast;
    document.getElementById('set-practice').checked = !!settings.practice;
  }
  function saveSettings() { saveJSON(SETTINGS_KEY, settings); }

  /* ---------- Stats ---------- */
  function defaultStats() {
    return {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0], // wins by guess count (index 0 = 1 guess)
      lastDayCompleted: null,            // dayNum of last finished daily game
      lastResult: null,                   // 'win' | 'loss'
    };
  }
  function saveStats() { saveJSON(STATS_KEY, stats); }

  /* ---------- Game state ---------- */
  function newGameState({ practice = false } = {}) {
    const word = practice ? randomAnswer() : dailyAnswer().word;
    const dayNum = practice ? null : dayNumber();
    return {
      mode: practice ? 'practice' : 'daily',
      target: word,
      dayNum,
      guesses: [],   // array of {word, statuses[]}
      current: '',   // current in-progress guess (string)
      status: 'playing', // 'playing' | 'won' | 'lost'
      hardMode: !!settings.hardMode,
    };
  }

  function loadOrCreateGame() {
    const saved = loadJSON(STORAGE_KEY, null);
    if (settings.practice) {
      // For practice we don't persist between launches if mode just changed - but keep
      // the in-progress game if it exists.
      if (saved && saved.mode === 'practice' && saved.status === 'playing') {
        return saved;
      }
      return newGameState({ practice: true });
    }
    // Daily mode
    const today = dayNumber();
    if (saved && saved.mode === 'daily' && saved.dayNum === today) {
      return saved;
    }
    // Either no save, different day, or was practice — start fresh daily
    return newGameState({ practice: false });
  }

  function saveGame() { saveJSON(STORAGE_KEY, state); }

  /* ---------- Board rendering ---------- */
  function buildBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.row = String(r);
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.row = String(r);
        tile.dataset.col = String(c);
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function renderBoard() {
    // Fill committed guesses
    const rows = boardEl.querySelectorAll('.row');
    for (let r = 0; r < ROWS; r++) {
      const tiles = rows[r].querySelectorAll('.tile');
      const guess = state.guesses[r];
      if (guess) {
        for (let c = 0; c < COLS; c++) {
          const t = tiles[c];
          t.textContent = guess.word[c].toUpperCase();
          t.classList.remove('filled', 'flip');
          t.classList.remove('correct', 'present', 'absent');
          t.classList.add(guess.statuses[c]);
        }
      } else if (r === state.guesses.length) {
        // Active row, show current input
        for (let c = 0; c < COLS; c++) {
          const t = tiles[c];
          const ch = state.current[c] || '';
          t.textContent = ch.toUpperCase();
          t.classList.remove('correct', 'present', 'absent');
          if (ch) t.classList.add('filled');
          else t.classList.remove('filled');
        }
      } else {
        // Future row, empty
        for (let c = 0; c < COLS; c++) {
          const t = tiles[c];
          t.textContent = '';
          t.classList.remove('filled', 'flip', 'correct', 'present', 'absent');
        }
      }
    }
    renderKeyboardStates();
  }

  /* ---------- Keyboard ---------- */
  const KB_LAYOUT = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['ENTER','z','x','c','v','b','n','m','BACK'],
  ];
  function buildKeyboard() {
    keyboardEl.innerHTML = '';
    KB_LAYOUT.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'key' + (k === 'ENTER' || k === 'BACK' ? ' wide' : '');
        btn.dataset.key = k;
        if (k === 'BACK') {
          btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>';
          btn.setAttribute('aria-label', 'Backspace');
        } else if (k === 'ENTER') {
          btn.textContent = 'Enter';
        } else {
          btn.textContent = k;
        }
        btn.addEventListener('click', () => onKey(k));
        rowEl.appendChild(btn);
      });
      keyboardEl.appendChild(rowEl);
    });
  }

  // Compute the "best" status per letter from all committed guesses
  function renderKeyboardStates() {
    const best = {}; // letter -> 'correct' | 'present' | 'absent'
    const order = { absent: 0, present: 1, correct: 2 };
    for (const g of state.guesses) {
      for (let i = 0; i < g.word.length; i++) {
        const ch = g.word[i];
        const st = g.statuses[i];
        if (!best[ch] || order[st] > order[best[ch]]) best[ch] = st;
      }
    }
    keyboardEl.querySelectorAll('.key').forEach(btn => {
      btn.classList.remove('correct', 'present', 'absent');
      const k = btn.dataset.key;
      if (k && k.length === 1 && best[k]) btn.classList.add(best[k]);
    });
  }

  /* ---------- Input handling ---------- */
  function onKey(k) {
    if (isAnimating) return;
    if (state.status !== 'playing') {
      // If game is over, reopen the stats modal so the user gets the share/results
      if (k === 'ENTER') openModal('modal-stats');
      return;
    }
    if (k === 'ENTER') return submitGuess();
    if (k === 'BACK') return backspace();
    if (/^[a-z]$/.test(k)) return typeLetter(k);
  }

  function typeLetter(ch) {
    if (state.current.length >= COLS) return;
    state.current += ch;
    renderBoard();
  }
  function backspace() {
    if (!state.current) return;
    state.current = state.current.slice(0, -1);
    renderBoard();
  }

  function showMessage(text, ms = 1400) {
    messageEl.textContent = text;
    messageEl.classList.add('show');
    clearTimeout(showMessage._t);
    if (ms > 0) {
      showMessage._t = setTimeout(() => messageEl.classList.remove('show'), ms);
    }
  }
  function hideMessage() {
    clearTimeout(showMessage._t);
    messageEl.classList.remove('show');
  }

  function shakeCurrentRow() {
    const row = boardEl.querySelector(`.row[data-row="${state.guesses.length}"]`);
    if (!row) return;
    row.classList.remove('shake');
    // Trigger reflow
    void row.offsetWidth;
    row.classList.add('shake');
    setTimeout(() => row.classList.remove('shake'), 650);
  }

  // Hard mode validation: any revealed greens must remain in place; any yellows must be reused
  function checkHardMode(guess) {
    if (!state.hardMode || state.guesses.length === 0) return null;
    const last = state.guesses[state.guesses.length - 1];
    // Check greens (correct)
    for (let i = 0; i < COLS; i++) {
      if (last.statuses[i] === 'correct' && guess[i] !== last.word[i]) {
        const ord = ['1st','2nd','3rd','4th','5th'][i];
        return `${ord} letter must be ${last.word[i].toUpperCase()}`;
      }
    }
    // Build a multiset of required-present letters from ALL prior guesses (greens & yellows)
    // accounting for letters already accepted as correct.
    const required = {};
    for (const g of state.guesses) {
      const counts = {};
      for (let i = 0; i < COLS; i++) {
        if (g.statuses[i] === 'present' || g.statuses[i] === 'correct') {
          counts[g.word[i]] = (counts[g.word[i]] || 0) + 1;
        }
      }
      // Take per-guess max (NYT behavior)
      for (const [ch, n] of Object.entries(counts)) {
        if (!required[ch] || n > required[ch]) required[ch] = n;
      }
    }
    // Subtract greens already satisfied by guess in same position
    const guessCounts = {};
    for (const ch of guess) guessCounts[ch] = (guessCounts[ch] || 0) + 1;
    for (const [ch, n] of Object.entries(required)) {
      if ((guessCounts[ch] || 0) < n) {
        return `Guess must contain ${ch.toUpperCase()}`;
      }
    }
    return null;
  }

  function submitGuess() {
    if (state.current.length < COLS) {
      shakeCurrentRow();
      showMessage('Not enough letters');
      return;
    }
    const guess = state.current.toLowerCase();
    if (!VALID_GUESSES.has(guess)) {
      shakeCurrentRow();
      showMessage('Not in word list');
      return;
    }
    const hardErr = checkHardMode(guess);
    if (hardErr) {
      shakeCurrentRow();
      showMessage(hardErr);
      return;
    }

    const statuses = scoreGuess(guess, state.target);
    const rowIdx = state.guesses.length;
    state.guesses.push({ word: guess, statuses });
    state.current = '';
    saveGame();

    // Animate flip, then reveal status / win logic
    animateFlip(rowIdx, statuses, () => {
      renderKeyboardStates();
      if (guess === state.target) {
        state.status = 'won';
        saveGame();
        bounceRow(rowIdx);
        recordResult(true, rowIdx + 1);
        showMessage(['Genius','Magnificent','Impressive','Splendid','Great','Phew'][rowIdx], 2000);
        setTimeout(() => openModal('modal-stats'), 1800);
      } else if (state.guesses.length >= ROWS) {
        state.status = 'lost';
        saveGame();
        recordResult(false, 0);
        showMessage(state.target.toUpperCase(), 0);
        setTimeout(() => openModal('modal-stats'), 1600);
      }
    });
  }

  // Wordle scoring with double-letter handling
  function scoreGuess(guess, target) {
    const result = new Array(COLS).fill('absent');
    const tArr = target.split('');
    // First pass: greens
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === tArr[i]) {
        result[i] = 'correct';
        tArr[i] = null;
      }
    }
    // Second pass: yellows
    for (let i = 0; i < COLS; i++) {
      if (result[i] === 'correct') continue;
      const idx = tArr.indexOf(guess[i]);
      if (idx !== -1) {
        result[i] = 'present';
        tArr[idx] = null;
      }
    }
    return result;
  }

  function animateFlip(rowIdx, statuses, done) {
    const row = boardEl.querySelector(`.row[data-row="${rowIdx}"]`);
    if (!row) { done(); return; }
    const tiles = row.querySelectorAll('.tile');
    isAnimating = true;
    tiles.forEach((t, i) => {
      // Set up so the post-50% state is the colored one
      setTimeout(() => {
        t.classList.remove('filled');
        t.classList.add('flip', statuses[i]);
      }, i * 280);
    });
    setTimeout(() => {
      isAnimating = false;
      tiles.forEach(t => t.classList.remove('flip'));
      done();
    }, COLS * 280 + 350);
  }

  function bounceRow(rowIdx) {
    const row = boardEl.querySelector(`.row[data-row="${rowIdx}"]`);
    if (!row) return;
    setTimeout(() => row.classList.add('bounce'), 100);
    setTimeout(() => row.classList.remove('bounce'), 1500);
  }

  /* ---------- Stats updates ---------- */
  function recordResult(won, guessNumber) {
    if (state.mode !== 'daily') return; // only count daily

    const today = state.dayNum;
    // Don't double-count if user somehow re-completes the same day
    if (stats.lastDayCompleted === today) return;

    stats.played += 1;
    if (won) {
      stats.wins += 1;
      stats.distribution[guessNumber - 1] += 1;
      // streak: continue if lastDayCompleted was yesterday OR same day chain;
      // if won today and previous day completed was today-1 with a win, increment.
      if (stats.lastResult === 'win' && stats.lastDayCompleted === today - 1) {
        stats.currentStreak += 1;
      } else {
        stats.currentStreak = 1;
      }
      if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
      stats.lastResult = 'win';
    } else {
      stats.currentStreak = 0;
      stats.lastResult = 'loss';
    }
    stats.lastDayCompleted = today;
    saveStats();
  }

  /* ---------- Stats modal ---------- */
  function renderStats() {
    document.getElementById('stat-played').textContent = stats.played;
    const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    document.getElementById('stat-winpct').textContent = winPct;
    document.getElementById('stat-streak').textContent = stats.currentStreak;
    document.getElementById('stat-maxstreak').textContent = stats.maxStreak;

    const dist = document.getElementById('distribution');
    dist.innerHTML = '';
    const max = Math.max(1, ...stats.distribution);
    const finishedRow = (state.status === 'won') ? state.guesses.length : -1;

    for (let i = 0; i < 6; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'dist-row';
      const label = document.createElement('div');
      label.textContent = String(i + 1);
      const bar = document.createElement('div');
      bar.className = 'dist-bar';
      const count = stats.distribution[i];
      const pct = (count / max) * 100;
      bar.style.width = `${Math.max(7, pct)}%`;
      bar.textContent = String(count);
      if ((i + 1) === finishedRow) bar.classList.add('highlight');
      wrap.appendChild(label);
      wrap.appendChild(bar);
      dist.appendChild(wrap);
    }

    const footer = document.getElementById('stats-footer');
    if (state.mode === 'daily' && state.status !== 'playing') {
      footer.hidden = false;
      updateCountdown();
      clearInterval(renderStats._t);
      renderStats._t = setInterval(updateCountdown, 1000);
    } else {
      footer.hidden = true;
      clearInterval(renderStats._t);
    }
  }

  function updateCountdown() {
    const el = document.getElementById('countdown');
    if (!el) return;
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0); // local midnight
    const diff = tomorrow - now;
    const h = String(Math.floor(diff / 3.6e6)).padStart(2, '0');
    const m = String(Math.floor((diff % 3.6e6) / 6e4)).padStart(2, '0');
    const s = String(Math.floor((diff % 6e4) / 1000)).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }

  /* ---------- Sharing ---------- */
  function buildShareText() {
    const useContrast = !!settings.contrast;
    const greenSquare  = useContrast ? '🟧' : '🟩';
    const yellowSquare = useContrast ? '🟦' : '🟨';
    const blackSquare  = settings.darkTheme ? '⬛' : '⬜';
    const tries = state.status === 'won' ? state.guesses.length : 'X';
    const hardMark = state.hardMode ? '*' : '';
    const tag = state.mode === 'daily' ? `Wordle ${state.dayNum}` : 'Wordle (Practice)';
    const lines = state.guesses.map(g =>
      g.statuses.map(s => s === 'correct' ? greenSquare : s === 'present' ? yellowSquare : blackSquare).join('')
    );
    return `${tag} ${tries}/6${hardMark}\n\n${lines.join('\n')}`;
  }

  async function shareResults() {
    const text = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) { /* user cancelled or share failed - fall through */ }
    try {
      await navigator.clipboard.writeText(text);
      showMessage('Copied results to clipboard');
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showMessage('Copied results to clipboard'); }
      catch (_) { showMessage('Could not copy'); }
      ta.remove();
    }
  }

  /* ---------- Modals ---------- */
  function openModal(id) {
    document.querySelectorAll('.modal').forEach(m => { m.hidden = true; });
    const m = document.getElementById(id);
    if (!m) return;
    if (id === 'modal-stats') renderStats();
    m.hidden = false;
  }
  function closeModal(m) {
    if (m && m.classList && m.classList.contains('modal')) {
      m.hidden = true;
      clearInterval(renderStats._t);
      return;
    }
    document.querySelectorAll('.modal:not([hidden])').forEach(x => x.hidden = true);
    clearInterval(renderStats._t);
  }

  /* ---------- Wiring up UI ---------- */
  function wireUI() {
    document.getElementById('btn-help').addEventListener('click', () => openModal('modal-help'));
    document.getElementById('btn-stats').addEventListener('click', () => openModal('modal-stats'));
    document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));
    document.getElementById('btn-share').addEventListener('click', shareResults);

    // Close on backdrop click or X button
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
      modal.querySelectorAll('[data-close]').forEach(b =>
        b.addEventListener('click', () => closeModal(modal)));
    });

    // Settings toggles
    document.getElementById('set-hard').addEventListener('change', (e) => {
      // Per Wordle rules, hard mode can only be toggled before first guess
      if (state.status === 'playing' && state.guesses.length > 0 && e.target.checked) {
        e.target.checked = false;
        showMessage("Hard mode can only be enabled at the start of a round");
        return;
      }
      settings.hardMode = e.target.checked;
      state.hardMode = settings.hardMode;
      saveSettings();
      saveGame();
    });
    document.getElementById('set-dark').addEventListener('change', (e) => {
      settings.darkTheme = e.target.checked;
      saveSettings();
      applySettings();
    });
    document.getElementById('set-contrast').addEventListener('change', (e) => {
      settings.contrast = e.target.checked;
      saveSettings();
      applySettings();
    });
    document.getElementById('set-practice').addEventListener('change', (e) => {
      settings.practice = e.target.checked;
      saveSettings();
      applySettings();
      // Switch game mode
      if (settings.practice) {
        state = newGameState({ practice: true });
      } else {
        state = loadOrCreateGame();
      }
      saveGame();
      renderBoard();
      hideMessage();
    });
    document.getElementById('btn-new-practice').addEventListener('click', () => {
      if (!settings.practice) return;
      state = newGameState({ practice: true });
      saveGame();
      renderBoard();
      hideMessage();
    });

    // Physical keyboard
    document.addEventListener('keydown', (e) => {
      // Don't intercept when a modal is open
      const modalOpen = !!document.querySelector('.modal:not([hidden])');
      if (modalOpen) {
        if (e.key === 'Escape') closeModal();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); onKey('ENTER'); return; }
      if (e.key === 'Backspace') { e.preventDefault(); onKey('BACK'); return; }
      if (/^[a-zA-Z]$/.test(e.key)) { onKey(e.key.toLowerCase()); }
    });

    // First-launch help
    if (!localStorage.getItem('wordle.seenHelp')) {
      localStorage.setItem('wordle.seenHelp', '1');
      setTimeout(() => openModal('modal-help'), 250);
    }
  }

  /* ---------- Day-rollover handling ---------- */
  // If the user keeps the tab open across midnight, refresh to today's puzzle
  function watchDayRollover() {
    setInterval(() => {
      if (settings.practice) return;
      if (state.mode !== 'daily') return;
      if (state.dayNum !== dayNumber()) {
        state = loadOrCreateGame();
        saveGame();
        buildBoard();
        renderBoard();
        hideMessage();
        showMessage("New Wordle available!", 3000);
      }
    }, 60 * 1000);
  }

  /* ---------- Service worker ---------- */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      // Register relative to current page so it works on GitHub Pages subpaths
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  /* ---------- Init ---------- */
  function init() {
    settings = Object.assign(defaultSettings(), loadJSON(SETTINGS_KEY, {}));
    stats    = Object.assign(defaultStats(),    loadJSON(STATS_KEY, {}));
    saveStats();
    saveSettings();
    applySettings();

    state = loadOrCreateGame();
    saveGame();

    buildBoard();
    buildKeyboard();
    renderBoard();
    wireUI();
    watchDayRollover();
    registerSW();
  }

  init();
})();
