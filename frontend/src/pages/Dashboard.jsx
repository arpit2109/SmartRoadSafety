import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Cpu, TrendingUp, AlertCircle, History } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const StatCard = ({ label, value, icon: Icon, unit = '', accent = 'blue' }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-2">
        {value ?? '—'}
        {unit && <span className="text-lg font-medium text-slate-400 ml-1">{unit}</span>}
      </p>
    </div>
    <div className={`p-2.5 rounded-lg bg-${accent}-50 text-${accent}-600`}>
      <Icon size={20} />
    </div>
  </div>
);

const Dashboard = () => {
  const { user, fetchUserProfile } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch profile, model stats, and detection history stats in parallel
        const [profileRes, modelStatsRes, historyStatsRes] = await Promise.all([
          api.get('/api/auth/profile/'),
          api.get('/api/ai/models/dashboard-stats/'),
          api.get('/api/detection/history/stats/'),
        ]);
        setStats({
          ...modelStatsRes.data,
          ...historyStatsRes.data,
        });
        fetchUserProfile();
      } catch (err) {
        setError(
          err.response?.data?.detail ||
          'Failed to load dashboard data. Is the backend running?'
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchUserProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Good {getTimeOfDay()}, {user?.username || 'there'}{' '}
          <span className="text-2xl">👋</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here's an overview of your SmartRoadSafety account.
        </p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">{error}</p>
            <p className="text-xs text-red-500 mt-1">
              Make sure the Django backend is running on port 8000.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              label="Active Models"
              value={stats?.active_models ?? '—'}
              icon={Cpu}
              accent="blue"
            />
            <StatCard
              label="Avg. Confidence"
              value={stats?.average_confidence ?? '—'}
              unit="%"
              icon={TrendingUp}
              accent="green"
            />
            <StatCard
              label="Detection Runs"
              value={stats?.total_detections ?? '—'}
              icon={Activity}
              accent="indigo"
            />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              label="Last 7 Days"
              value={stats?.detections_last_7_days ?? '—'}
              icon={History}
              accent="orange"
            />
            <StatCard
              label="Objects Detected"
              value={stats?.total_objects_detected ?? '—'}
              icon={Activity}
              accent="purple"
            />
            {stats?.most_used_model && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm font-medium text-slate-500">Most Used Model</p>
                <p className="text-xl font-bold text-slate-900 mt-2">
                  {stats.most_used_model.name}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {stats.most_used_model.count} runs
                </p>
              </div>
            )}
          </div>

          {/* Detection mode breakdown */}
          {stats?.by_mode && Object.keys(stats.by_mode).length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-base font-semibold text-slate-800 mb-4">
                Detections by Mode
              </h2>
              <div className="flex flex-wrap gap-3">
                {Object.entries(stats.by_mode).map(([mode, count]) => (
                  <div
                    key={mode}
                    className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2"
                  >
                    <span className="text-sm font-medium text-slate-700 capitalize">
                      {mode}
                    </span>
                    <span className="text-sm font-bold text-blue-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7-day timeline */}
          {stats?.daily_timeline && stats.daily_timeline.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-base font-semibold text-slate-800 mb-4">
                Last 7 Days Activity
              </h2>
              <div className="flex items-end gap-2 h-24">
                {stats.daily_timeline.map((day, i) => {
                  const max = Math.max(...stats.daily_timeline.map(d => d.count), 1);
                  const heightPct = (day.count / max) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-slate-500">
                        {day.count}
                      </span>
                      <div
                        className="w-full rounded-sm bg-blue-500 transition-all"
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                        title={`${day.date}: ${day.count} detections`}
                      />
                      <span className="text-xs text-slate-400">
                        {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
            <h2 className="text-xl font-semibold text-slate-800">
              Ready to run a new detection?
            </h2>
            <p className="text-slate-500 max-w-md">
              Upload an image or video, select a model, and our AI will detect
              vehicles, helmets, and other road safety features automatically.
            </p>
            <div className="flex gap-3">
              <Link
                to="/detect/manual"
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 hover:shadow-md transition-all"
              >
                Start Manual Detection
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const getTimeOfDay = () => {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
};

export default Dashboard;
