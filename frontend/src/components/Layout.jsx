import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LogOut,
  LayoutDashboard,
  ScanSearch,
  User,
  Cpu,
  Upload,
  Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Dynamic page title
// ---------------------------------------------------------------------------

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/detect/manual': 'Manual Detection',
  '/models': 'Model Management',
  '/models/upload': 'Upload Model',
  '/profile': 'My Profile',
};

const getTitle = (path) => PAGE_TITLES[path] || 'SmartRoadSafety';

// ---------------------------------------------------------------------------
// Nav item
// ---------------------------------------------------------------------------

const NavLink = ({ to, icon: Icon, label, badge }) => {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'
      }`}
    >
      <span className="flex items-center gap-2.5">
        {Icon && <Icon size={16} />}
        {label}
      </span>
      {badge && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
          {badge}
        </span>
      )}
    </Link>
  );
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U';

  const isAdmin = user?.is_staff === true;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-64 bg-white border-r border-slate-200 shadow-sm flex flex-col shrink-0">
        {/* Brand */}
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent leading-tight">
            SmartRoadSafety
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">AI Detection Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavLink to="/detect/manual" icon={ScanSearch} label="Manual Detection" />


          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1">
                <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Admin
                </p>
              </div>
              <NavLink to="/models" icon={Cpu} label="Model Management" />
              <NavLink to="/models/upload" icon={Upload} label="Upload Model" />
            </>
          )}
        </nav>

        {/* User + logout */}
        <div className="p-4 border-t border-slate-100 space-y-3">
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <Shield size={13} className="text-amber-600 shrink-0" />
              <span className="text-xs font-medium text-amber-700">Administrator</span>
            </div>
          )}
          <Link to="/profile" className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer group">
            {user?.profile_picture ? (
              <img src={user.profile_picture} alt="Profile" className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200" />
            ) : (
              <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                {user?.username || 'User'}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email || ''}</p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 shadow-sm h-16 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {getTitle(location.pathname)}
          </h2>
          <Link to="/profile" className="rounded-full hover:ring-2 hover:ring-blue-100 transition-all shrink-0">
            {user?.profile_picture ? (
              <img src={user.profile_picture} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                {initials}
              </div>
            )}
          </Link>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
