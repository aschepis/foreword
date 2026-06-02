import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './pages/Home.jsx';
import RepoView from './pages/RepoView.jsx';
import ReviewView from './pages/ReviewView.jsx';
import Settings from './pages/Settings.jsx';
import { useTheme } from './lib/theme.js';

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      className="lr-theme-toggle"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to paper (light)' : 'Switch to ink (dark)'}
      aria-label="Toggle theme"
    >
      {isDark
        /* Sun glyph for the "switch to light" affordance */
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
        /* Moon glyph for the "switch to dark" affordance */
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      }
    </button>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bg-line bg-bg-soft px-5 py-3 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-1 text-text hover:no-underline">
          <span className="lr-fleuron">❦</span>
          <span className="lr-serif text-[20px] font-semibold leading-none tracking-tight">Foreword</span>
        </Link>
        <nav className="flex gap-5 text-text-muted">
          <NavLink to="/" end className={({isActive}) => `lr-eyebrow ${isActive ? 'text-text' : 'hover:text-text'}`}>Repos</NavLink>
          <NavLink to="/settings" className={({isActive}) => `lr-eyebrow ${isActive ? 'text-text' : 'hover:text-text'}`}>Settings</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:block lr-serif italic text-xs text-text-dim">Read your own work before the world does.</div>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/repos/:repoId" element={<RepoView />} />
          <Route path="/reviews/:reviewId" element={<ReviewView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
