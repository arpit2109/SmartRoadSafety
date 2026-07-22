import React from 'react';
import { Outlet, Link } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 shadow-sm flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-center">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            SmartRoadSafety
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" className="block px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
            Dashboard
          </Link>
          <Link to="/detect/manual" className="block px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
            Manual Detection
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <Link to="/login" className="block px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
            Logout
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 shadow-sm h-16 flex items-center justify-between px-6">
          <h2 className="text-lg font-semibold text-slate-800">Overview</h2>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              U
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8 flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
