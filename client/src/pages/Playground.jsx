import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import DebugArena from '../components/DebugArena';
import { useAuth } from '../context/AuthContext';
import { useNotice } from '../context/NoticeContext';
import { apiRequest } from '../lib/api';
import { celebrateBadges } from '../lib/badges';
import { makeZip } from '../lib/zip';
import { LANGUAGES, EXAMPLES, STARTERS, CHALLENGES, TIPS } from '../data/playground';
import '../css/Playground.css';

const EDITOR_ORIGIN = 'https://onecompiler.com';
const SAVE_KEY = (lang) => `codesphere_playground_${lang}`;
const SOLVED_KEY = 'codesphere_playground_solved';

function editorUrl(language, theme) {
  const params = new URLSearchParams({
    hideNew: 'true',
    hideNewFileOption: 'true',
    hideTitle: 'true',
    listenToEvents: 'true',
    codeChangeEvent: 'true',
    theme,
  });
  return `${EDITOR_ORIGIN}/embed/${language}?${params}`;
}

// Compiled languages build every file together, so running another file
// means sending that file on its own (two main() functions would clash).
const COMPILED = new Set(['c', 'cpp', 'java', 'go', 'rust']);
// Only code and text files go into downloads (no attached photos etc.).
const CODE_FILE = /\.(py|c|h|cpp|cc|hpp|java|js|mjs|cjs|ts|go|rs|sql|txt|md|json|csv|html|css|xml|ya?ml)$/i;
const RESTORE_AFTER_MS = 30000;

function commentPrefix(language) {
  if (language === 'python') return '#';
  if (language === 'mysql') return '--';
  return '//';
}

function challengeTemplate(challenge, language) {
  const c = commentPrefix(language);
  return (
    `${c} Challenge: ${challenge.title} (${challenge.level}, +${challenge.xp} XP)\n` +
    `${c} ${challenge.description}\n` +
    `${c} Expected output:\n` +
    challenge.example.split('\n').map((line) => `${c}   ${line}`).join('\n') +
    `\n\n${STARTERS[language] || ''}`
  );
}

// Messages for "Check answer" results.
const FAIL_HEADLINES = {
  'compile-error': '❌ Your code didn\'t compile.',
  'runtime-error': '❌ Your code crashed while running.',
  timeout: '⏱️ Your code took too long.',
  'service-error': '⚠️ The code checker is down right now.',
  'request-error': '⚠️ Couldn\'t check your code.',
};

function resultHeadline(result) {
  if (result.passed) {
    return result.alreadySolved
      ? '✅ Correct! You already solved this one.'
      : `✅ Correct! +${result.xp} XP earned.`;
  }
  return FAIL_HEADLINES[result.status] || '❌ Not quite. The output doesn\'t match yet.';
}

function loadSolved() {
  try {
    return JSON.parse(localStorage.getItem(SOLVED_KEY)) || [];
  } catch {
    return [];
  }
}

const Playground = () => {
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [activeExample, setActiveExample] = useState(0);
  const [theme, setTheme] = useState('dark');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const challenges = CHALLENGES;
  const [solved, setSolved] = useState(loadSolved);

  // Signed-in students' solved challenges live on their account (they count
  // on the leaderboard); guests keep them in this browser.
  const { user, token } = useAuth();
  const { showNotice } = useNotice();
  const isLoggedIn = Boolean(user && token);
  const [openHint, setOpenHint] = useState(null);
  const [highlighted, setHighlighted] = useState(null);
  const [activeChallenge, setActiveChallenge] = useState(null);
  // Judge0 checker:
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  // The server checks answers automatically unless it says otherwise; then
  // students mark challenges done themselves.
  const [manualMode, setManualMode] = useState(false);

  const iframeRef = useRef(null);
  const langRailRef = useRef(null);

  // Language bar scrolls by itself in a loop (the list is rendered twice).
  // Pauses on hover, touch or keyboard focus; off for reduced motion.
  useEffect(() => {
    const rail = langRailRef.current;
    if (!rail || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let paused = false;
    let frame = 0;
    let last = performance.now();
    let pos = rail.scrollLeft;
    const step = (now) => {
      const dt = Math.min(64, now - last);
      last = now;
      const half = rail.scrollWidth / 2;
      if (!paused && half > rail.clientWidth) {
        pos += dt * 0.04; // ~40px per second
        if (pos >= half) pos -= half;
        rail.scrollLeft = pos;
      } else {
        pos = rail.scrollLeft % half || rail.scrollLeft; // follow manual scrolling
      }
      frame = requestAnimationFrame(step);
    };
    const pause = () => { paused = true; };
    const resume = () => { paused = false; pos = rail.scrollLeft; };
    const events = [['mouseenter', pause], ['mouseleave', resume], ['focusin', pause], ['focusout', resume], ['touchstart', pause], ['touchend', resume]];
    events.forEach(([e, f]) => rail.addEventListener(e, f, { passive: true }));
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      events.forEach(([e, f]) => rail.removeEventListener(e, f));
    };
  }, []);
  const workspaceRef = useRef(null);
  // Latest code in the editor, kept in a ref so typing doesn't re-render the page.
  const codeRef = useRef('');
  // Every file in the editor (students can add files inside OneCompiler).
  const filesRef = useRef([]);
  const [fileNames, setFileNames] = useState([]);
  const [runTarget, setRunTarget] = useState('');
  // While another file is running, the editor briefly holds a reshuffled copy.
  const swapRef = useRef(null);

  const examples = EXAMPLES[language.id] || [];
  const totalXp = useMemo(() => challenges.reduce((sum, c) => sum + c.xp, 0), [challenges]);
  const earnedXp = useMemo(
    () => challenges.filter((c) => solved.includes(c.id)).reduce((s, c) => s + c.xp, 0),
    [challenges, solved],
  );

  const postFiles = useCallback(
    (files) => {
      iframeRef.current?.contentWindow?.postMessage(
        { eventType: 'populateCode', language: language.id, files },
        EDITOR_ORIGIN,
      );
    },
    [language],
  );

  // Replace the editor's contents with one file (examples, reset, challenges).
  const sendToEditor = useCallback(
    (code) => {
      codeRef.current = code;
      filesRef.current = [{ name: language.file, content: code }];
      setFileNames([language.file]);
      setRunTarget(language.file);
      postFiles(filesRef.current);
    },
    [language, postFiles],
  );

  // Put the student's files back the way they were after running another file.
  const restoreFiles = useCallback((latest) => {
    const swap = swapRef.current;
    if (!swap) return;
    window.clearTimeout(swap.timer);
    swapRef.current = null;
    // Keep any edits made while it ran, mapped back to the real names.
    const edited = new Map((latest || []).map((f) => [swap.renamed[f.name] || f.name, f.content]));
    const restored = swap.original.map((f) => ({ ...f, content: edited.has(f.name) ? edited.get(f.name) : f.content }));
    filesRef.current = restored;
    postFiles(restored);
  }, [postFiles]);

  // When the editor (re)loads, restore the saved draft or the first example.
  const handleEditorLoad = () => {
    // A theme switch reloads the editor: bring back every file, not just main.
    if (filesRef.current.length > 1 && !swapRef.current) {
      const files = filesRef.current;
      window.setTimeout(() => postFiles(files), 800);
      return;
    }
    const code =
      codeRef.current ||
      (activeChallenge ? challengeTemplate(activeChallenge, language.id) : '') ||
      localStorage.getItem(SAVE_KEY(language.id)) ||
      examples[0]?.code ||
      '';
    // Give the embedded editor a moment to initialise before sending code.
    window.setTimeout(() => sendToEditor(code), 800);
  };

  // Track edits from the editor and autosave them per language.
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== EDITOR_ORIGIN || !Array.isArray(event.data?.files)) return;
      const files = event.data.files.filter((f) => f && typeof f.name === 'string');
      // While another file is running, the editor holds a reshuffled copy: wait
      // for the run to finish, then put the real files back.
      if (swapRef.current) {
        swapRef.current.latest = files;
        if (event.data.action === 'runComplete') window.setTimeout(() => restoreFiles(files), 300);
        return;
      }
      if (!files.length) return;
      filesRef.current = files;
      const names = files.map((f) => f.name);
      setFileNames((prev) => (prev.join('\n') === names.join('\n') ? prev : names));
      setRunTarget((prev) => (names.includes(prev) ? prev : names.includes(language.file) ? language.file : names[0]));
      const main = files.find((f) => f.name === language.file) || files[0];
      if (typeof main.content !== 'string') return;
      codeRef.current = main.content;
      localStorage.setItem(SAVE_KEY(language.id), main.content);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [language, restoreFiles]);

  // Support links like /playground#debugging-arena (after the page renders).
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return undefined;
    const id = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(id);
  }, [hash]);

  // Rotate the coding tips.
  useEffect(() => {
    const id = window.setInterval(
      () => setTipIndex((i) => (i + 1) % TIPS.length),
      6000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Escape leaves fullscreen; lock page scroll while fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => e.key === 'Escape' && setIsFullscreen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  // Judge0 answer checking: disabled until a RapidAPI key is set up.
  // // Challenges are public; solved status comes from the student's account.
  // useEffect(() => {
    // let cancelled = false;
    // apiRequest('/challenges')
      // .then((data) => !cancelled && setChallenges(data.challenges))
      // .catch(() => !cancelled && setChallenges([]));
    // return () => {
      // cancelled = true;
    // };
  // }, []);

  // useEffect(() => {
    // if (!isLoggedIn) return undefined;
    // let cancelled = false;
    // apiRequest('/challenges/progress')
      // .then((data) => !cancelled && setSolved(data.solved.map((item) => item.challengeId)))
      // .catch(() => {});
    // return () => {
      // cancelled = true;
    // };
  // }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let cancelled = false;
    apiRequest('/challenges/progress')
      .then((data) => {
        if (cancelled) return;
        setSolved(data.solved.map((item) => item.challengeId));
        setManualMode(Boolean(data.manualMode));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) localStorage.setItem(SOLVED_KEY, JSON.stringify(solved));
  }, [solved, isLoggedIn]);

  const switchLanguage = (next) => {
    if (next.id === language.id) return;
    codeRef.current = '';
    filesRef.current = [];
    if (swapRef.current) window.clearTimeout(swapRef.current.timer);
    swapRef.current = null;
    setFileNames([]);
    setRunTarget('');
    setActiveExample(0);
    setLanguage(next);
  };

  const loadExample = (index) => {
    setActiveExample(index);
    sendToEditor(examples[index].code);
    showNotice({
      tone: 'info',
      kicker: 'Example loaded',
      title: examples[index].title,
      message: 'The example is ready in the editor.',
    });
  };

  const triggerRun = () => {
    iframeRef.current?.contentWindow?.postMessage({ eventType: 'triggerRun' }, EDITOR_ORIGIN);
  };

  // OneCompiler always runs the main file (main.py, Main.java, …), or the first
  // file when there is no main file. To run a different file we briefly hand the
  // editor a copy where that file comes first, then restore everything.
  const runCode = () => {
    const files = filesRef.current;
    const target = files.find((f) => f.name === runTarget);
    if (swapRef.current || !target || files.length < 2 || target.name === language.file) {
      if (!swapRef.current) triggerRun();
      return;
    }
    const renamed = {};
    let runFiles;
    if (COMPILED.has(language.id)) {
      runFiles = [target];
    } else {
      runFiles = [target, ...files.filter((f) => f !== target).map((f) => {
        if (f.name !== language.file) return f;
        const name = `_${f.name}`;
        renamed[name] = f.name;
        return { ...f, name };
      })];
    }
    swapRef.current = {
      original: files,
      renamed,
      timer: window.setTimeout(() => restoreFiles(swapRef.current?.latest), RESTORE_AFTER_MS),
    };
    postFiles(runFiles);
    window.setTimeout(triggerRun, 500);
  };

  const resetCode = () => {
    localStorage.removeItem(SAVE_KEY(language.id));
    sendToEditor(examples[activeExample]?.code || '');
    showNotice({
      tone: 'info',
      kicker: 'Editor reset',
      title: 'Editor reset to the example',
      message: 'Your saved draft was cleared for this language.',
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeRef.current);
      showNotice({
        tone: 'success',
        kicker: 'Clipboard',
        title: 'Code copied',
        message: 'Your code is now on the clipboard.',
      });
    } catch {
      showNotice({
        tone: 'error',
        kicker: 'Clipboard',
        title: 'Could not copy code',
        message: 'Select the code and press Ctrl+C to copy it manually.',
      });
    }
  };

  // Downloads only the code: one file as itself, several as a .zip.
  // Attachments such as photos are left out.
  const downloadCode = () => {
    const all = filesRef.current.length ? filesRef.current : [{ name: language.file, content: codeRef.current }];
    const code = all.filter((f) => typeof f.content === 'string' && CODE_FILE.test(f.name));
    if (!code.length) {
      showNotice({ tone: 'error', kicker: 'Download', title: 'Nothing to download', message: 'There is no code in the editor yet.' });
      return;
    }
    const single = code.length === 1;
    const blob = single ? new Blob([code[0].content], { type: 'text/plain' }) : makeZip(code);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = single ? code[0].name : `codesphere-${language.id}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (code.length < all.length) {
      showNotice({ tone: 'info', kicker: 'Download', title: 'Only code files downloaded', message: `${all.length - code.length} attached file(s), such as images, were left out.` });
    }
  };

  const toggleTheme = () => {
    // Changing the theme reloads the iframe; codeRef keeps the current code.
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  const solveChallenge = (challenge) => {
    setActiveChallenge(challenge);
    setCheckResult(null);
    sendToEditor(challengeTemplate(challenge, language.id));
    workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showNotice({
      tone: 'info',
      kicker: 'Challenge loaded',
      title: challenge.title,
      message: `The challenge template is ready in ${language.label}. Give it a go!`,
    });
  };

  const exitChallenge = () => {
    setActiveChallenge(null);
    setCheckResult(null);
  };

  // The server runs the code and marks the challenge solved only if the
  // output is correct.
  const checkAnswer = async () => {
    if (!activeChallenge || checking) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await apiRequest(`/challenges/${activeChallenge.id}/check`, {
        method: 'POST',
        body: JSON.stringify({ language: language.id, code: codeRef.current }),
      });
      setCheckResult(result);
      if (result.passed) {
        setSolved((prev) => (prev.includes(activeChallenge.id) ? prev : [...prev, activeChallenge.id]));
        celebrateBadges(result.newBadges);
        showNotice({
          tone: 'success',
          kicker: 'Challenge solved',
          title: result.alreadySolved ? 'Correct again!' : 'Correct answer!',
          message: result.alreadySolved ? 'You had already solved this one.' : `+${result.xp} XP added to your account.`,
        });
      }
    } catch (err) {
      setCheckResult({ passed: false, status: 'request-error', error: err.message, output: '' });
    } finally {
      setChecking(false);
    }
  };

  const toggleSolved = async (id) => {
    if (!isLoggedIn) {
      setSolved((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      showNotice({
        tone: 'info',
        kicker: 'Guest progress',
        title: 'Sign in to save your XP',
        message: 'This challenge is saved in this browser. Sign in to add XP to the leaderboard.',
      });
      return;
    }

    const isSolved = solved.includes(id);
    try {
      const data = await apiRequest(`/challenges/${id}/done`, {
        method: isSolved ? 'DELETE' : 'POST',
        body: JSON.stringify({ language: language.id }),
      });
      setSolved(data.solved.map((item) => item.challengeId));
      celebrateBadges(data.newBadges);
      if (!isSolved) {
        const xp = challenges.find((c) => c.id === id)?.xp;
        showNotice({
          tone: 'success',
          kicker: 'Challenge solved',
          title: 'Challenge marked as done',
          message: `+${xp} XP added to your account.`,
        });
      }
    } catch (err) {
      showNotice({
        tone: 'error',
        kicker: 'Progress not saved',
        title: 'Could not update challenge progress',
        message: err.message,
      });
    }
  };

  const surpriseMe = () => {
    if (!challenges.length) return;
    const pending = challenges.filter((c) => !solved.includes(c.id));
    const pool = pending.length ? pending : challenges;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setHighlighted(pick.id);
    document
      .getElementById(`challenge-${pick.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setHighlighted(null), 2500);
  };

  return (
    <>
      <Navbar />

      <main className="playground-page">
        {/* Hero */}
        <section className="container playground-hero">
          <span className="section-eyebrow">
            <span className="section-eyebrow-line" />
            CODESPHERE PLAYGROUND
          </span>

          <h1 className="playground-title">
            Code anything. <span className="gold-text">Install nothing.</span>
          </h1>

          <p className="playground-subtitle">
            A full coding lab in your browser. Pick a language, load an example
            or take on a challenge, then hit Run. Works on any laptop, lab
            computer or phone.
          </p>

          <div className="playground-stats">
            <div>
              <strong>70+</strong>
              <span>languages</span>
            </div>
            <div>
              <strong>0</strong>
              <span>downloads</span>
            </div>
            <div>
              <strong>{challenges.length}</strong>
              <span>challenges</span>
            </div>
            <div>
              <strong>∞</strong>
              <span>free runs</span>
            </div>
          </div>
        </section>

        {/* Language picker */}
        <section className="container" aria-label="Choose a language">
          <div className="playground-languages is-marquee" role="tablist" ref={langRailRef}>
            {[...LANGUAGES, ...LANGUAGES].map((lang, index) => {
              const copy = index >= LANGUAGES.length; // duplicate for the seamless loop
              return (
              <button
                key={`${lang.id}-${copy ? 'b' : 'a'}`}
                type="button"
                role={copy ? undefined : 'tab'}
                aria-hidden={copy || undefined}
                tabIndex={copy ? -1 : undefined}
                aria-selected={copy ? undefined : lang.id === language.id}
                className={`playground-lang ${lang.id === language.id ? 'active' : ''}`}
                style={{ '--lang-color': lang.color }}
                onClick={() => switchLanguage(lang)}
              >
                <i className={`bi ${lang.icon}`} aria-hidden="true" />
                {lang.label}
              </button>
              );
            })}
          </div>
          <p className="playground-lang-tagline">
            <strong>{language.label}:</strong> {language.tagline}{' '}
            <span className="playground-muted">
              Need another language? Use the language menu inside the editor.
            </span>
          </p>
        </section>

        {/* Workspace */}
        <section
          ref={workspaceRef}
          className={`container playground-workspace ${isFullscreen ? 'is-fullscreen' : ''}`}
          aria-label="Code editor"
        >
          <aside className="playground-examples">
            <h2>
              <i className="bi bi-collection-play" aria-hidden="true" /> Examples
            </h2>
            <ul>
              {examples.map((example, index) => (
                <li key={example.title}>
                  <button
                    type="button"
                    className={`playground-example ${index === activeExample ? 'active' : ''}`}
                    onClick={() => loadExample(index)}
                  >
                    <span className="playground-example-top">
                      <span className="playground-example-title">{example.title}</span>
                      <span className={`playground-level level-${example.level.toLowerCase()}`}>
                        {example.level}
                      </span>
                    </span>
                    <span className="playground-example-desc">{example.description}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="playground-tip" aria-live="polite">
              <i className="bi bi-lightbulb" aria-hidden="true" />
              <p key={tipIndex}>{TIPS[tipIndex]}</p>
            </div>
          </aside>

          <div className="playground-editor">
            {/* Check answer: the server runs the code and saves it only if the output is right. */}
            {activeChallenge && !manualMode && (
              <div className="playground-check" aria-live="polite">
                <div className="playground-check-head">
                  <div className="playground-check-title">
                    <i className="bi bi-flag-fill" aria-hidden="true" />
                    <span>
                      <small>Solving</small>
                      {activeChallenge.title}
                    </span>
                  </div>

                  <div className="playground-check-actions">
                    {isLoggedIn ? (
                      <button
                        type="button"
                        className="playground-check-btn"
                        onClick={checkAnswer}
                        disabled={checking}
                      >
                        {checking ? (
                          <><span className="spinner-border spinner-border-sm" aria-hidden="true" /> Checking…</>
                        ) : (
                          <><i className="bi bi-check2-circle" aria-hidden="true" /> Check answer</>
                        )}
                      </button>
                    ) : (
                      <Link to="/login" className="playground-check-btn">
                        <i className="bi bi-box-arrow-in-right" aria-hidden="true" /> Sign in to check
                      </Link>
                    )}
                    <button
                      type="button"
                      className="playground-check-exit"
                      onClick={exitChallenge}
                      aria-label="Exit challenge"
                      title="Exit challenge"
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {!checkResult && !checking && (
                  <p className="playground-check-note">
                    Write your solution, press Run to test it, then Check answer.
                    It&apos;s marked solved only if the output is correct.
                  </p>
                )}

                {checkResult && (
                  <div className={`playground-check-result ${checkResult.passed ? 'pass' : 'fail'}`}>
                    <strong>{resultHeadline(checkResult)}</strong>
                    {!checkResult.passed && checkResult.status === 'ok' && (
                      <p>Compare your output with the expected output in the challenge.</p>
                    )}
                    {checkResult.status === 'service-error' && (
                      <>
                        <p>Your code couldn&apos;t be run, but you can still save your progress if your output matches the expected one.</p>
                        {!solved.includes(activeChallenge.id) && (
                          <button type="button" className="playground-check-btn" onClick={() => toggleSolved(activeChallenge.id)}>
                            <i className="bi bi-check2-square" aria-hidden="true" /> Mark as done
                          </button>
                        )}
                      </>
                    )}
                    {(checkResult.error || checkResult.output) && checkResult.status !== 'service-error' && (
                      <pre>{checkResult.error || checkResult.output}</pre>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="playground-toolbar">
              <div className="playground-file">
                <span className="playground-dots" aria-hidden="true">
                  <span /><span /><span />
                </span>
                <i className={`bi ${language.icon}`} aria-hidden="true" />
                {fileNames.length > 1 ? (
                  <label className="playground-run-target">
                    <span>Run</span>
                    <select value={runTarget} onChange={(e) => setRunTarget(e.target.value)} aria-label="File to run">
                      {fileNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                ) : language.file}
              </div>

              <div className="playground-actions">
                <button type="button" className="playground-run" onClick={runCode} title={fileNames.length > 1 ? `Run ${runTarget}` : 'Run'}>
                  <i className="bi bi-play-fill" aria-hidden="true" /> Run
                </button>
                <button type="button" onClick={resetCode} title="Reset to example" aria-label="Reset to example">
                  <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                </button>
                <button type="button" onClick={copyCode} title="Copy code" aria-label="Copy code">
                  <i className="bi bi-clipboard" aria-hidden="true" />
                </button>
                <button type="button" onClick={downloadCode} title={fileNames.length > 1 ? 'Download code (.zip)' : 'Download code'} aria-label="Download code">
                  <i className="bi bi-download" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  title="Toggle editor theme"
                  aria-label="Toggle editor theme"
                >
                  <i className={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreen((f) => !f)}
                  title={isFullscreen ? 'Exit focus mode (Esc)' : 'Focus mode'}
                  aria-label={isFullscreen ? 'Exit focus mode' : 'Focus mode'}
                >
                  <i
                    className={`bi ${isFullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <iframe
              key={`${language.id}-${theme}`}
              ref={iframeRef}
              title={`${language.label} code editor`}
              src={editorUrl(language.id, theme)}
              onLoad={handleEditorLoad}
              className="playground-iframe"
              data-nav-tone={theme === 'dark' ? 'dark' : 'light'}
              allow="clipboard-read; clipboard-write"
            />

            <p className="playground-footnote">
              Your code autosaves in this browser. Editor powered by{' '}
              <a href="https://onecompiler.com" target="_blank" rel="noreferrer">
                OneCompiler
              </a>
              .
            </p>
          </div>
        </section>

        {/* Challenges */}
        <section className="container playground-challenges">
          <div className="playground-challenges-head">
            <div>
              <span className="section-eyebrow">
                <span className="section-eyebrow-line" />
                LEVEL UP
              </span>
              <h2>Coding Challenges</h2>
              <p className="playground-muted">
                Solve them in any language. Write your code, then press Check answer to earn XP.
              </p>
            </div>

            <div className="playground-progress">
              <div className="playground-progress-label">
                <span>
                  <i className="bi bi-trophy-fill" aria-hidden="true" /> {earnedXp} / {totalXp} XP
                </span>
                <span>
                  {solved.length}/{challenges.length} solved
                </span>
              </div>
              <div
                className="playground-progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalXp}
                aria-valuenow={earnedXp}
              >
                <span style={{ width: `${totalXp ? (earnedXp / totalXp) * 100 : 0}%` }} />
              </div>
              <button type="button" className="btn btn-gold playground-surprise" onClick={surpriseMe}>
                <i className="bi bi-shuffle" aria-hidden="true" /> Surprise me
              </button>
            </div>
          </div>

          <div className="playground-challenge-grid">
            {challenges.map((challenge) => {
              const isSolved = solved.includes(challenge.id);
              return (
                <article
                  key={challenge.id}
                  id={`challenge-${challenge.id}`}
                  className={`playground-challenge ${isSolved ? 'solved' : ''} ${
                    highlighted === challenge.id ? 'highlight' : ''
                  }`}
                >
                  <div className="playground-challenge-top">
                    <span className={`playground-level level-${challenge.level.toLowerCase()}`}>
                      {challenge.level}
                    </span>
                    <span className="playground-xp">+{challenge.xp} XP</span>
                  </div>

                  <h3>{challenge.title}</h3>
                  <p>{challenge.description}</p>
                  <pre className="playground-sample">{challenge.example}</pre>

                  {openHint === challenge.id && (
                    <p className="playground-hint">
                      <i className="bi bi-lightbulb-fill" aria-hidden="true" /> {challenge.hint}
                    </p>
                  )}

                  <div className="playground-challenge-actions">
                    <button type="button" className="playground-solve" onClick={() => solveChallenge(challenge)}>
                      <i className="bi bi-code-slash" aria-hidden="true" /> {isSolved ? 'Solve again' : 'Solve it'}
                    </button>
                    <button
                      type="button"
                      className="playground-ghost"
                      onClick={() => setOpenHint(openHint === challenge.id ? null : challenge.id)}
                      aria-expanded={openHint === challenge.id}
                    >
                      Hint
                    </button>
                    {manualMode || !isLoggedIn ? (
                      <button
                        type="button"
                        className={`playground-ghost playground-done ${isSolved ? 'active' : ''}`}
                        onClick={() => toggleSolved(challenge.id)}
                        aria-pressed={isSolved}
                      >
                        <i className={`bi ${isSolved ? 'bi-check-circle-fill' : 'bi-circle'}`} aria-hidden="true" />
                        {isSolved ? 'Solved' : 'Done?'}
                      </button>
                    ) : isSolved ? (
                      <span className="playground-ghost playground-done active" aria-label="Solved">
                        <i className="bi bi-check-circle-fill" aria-hidden="true" /> Solved
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <DebugArena />

        {/* How it works */}
        <section className="container playground-steps">
          {[
            ['bi-translate', 'Pick a language', 'Python, C, Java, SQL and 70+ more, all ready in one click.'],
            ['bi-pencil-square', 'Write or load code', 'Start from an example, a challenge or a blank page.'],
            ['bi-play-circle', 'Run and experiment', 'See output instantly. Break things, fix them, learn faster.'],
          ].map(([icon, title, text], index) => (
            <div className="playground-step" key={title}>
              <span className="playground-step-num">{index + 1}</span>
              <i className={`bi ${icon}`} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Playground;
