import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './pages/Home.jsx';
import RepoView from './pages/RepoView.jsx';
import ReviewView from './pages/ReviewView.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bg-line bg-bg-soft px-4 py-2 flex items-center gap-4">
        <Link to="/" className="font-semibold text-text flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent" /> Foreword
        </Link>
        <nav className="flex gap-3 text-sm text-text-muted">
          <NavLink to="/" end className={({isActive}) => isActive ? 'text-text' : 'hover:text-text'}>Repos</NavLink>
          <NavLink to="/settings" className={({isActive}) => isActive ? 'text-text' : 'hover:text-text'}>Settings</NavLink>
        </nav>
        <div className="ml-auto text-xs text-text-dim">Self-review for the agentic era</div>
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
