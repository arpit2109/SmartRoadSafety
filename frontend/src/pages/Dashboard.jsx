import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Cpu, TrendingUp, AlertCircle } from 'lucide-react';
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
        // Fetch profile + dashboard stats in parallel
        const [profileRes, statsRes] = await Promise.all([
          api.get('/api/auth/profile/'),
          api.get('/api/ai/models/dashboard-stats/'),
        ]);
        setStats(statsRes.data);
        fetchUserProfile();
      } catch (err) {
        // 401 is handled by the api interceptor (redirect to login)
        // but we also show a friendly error in case of other failures
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
              value={stats?.average_confidence?.toFixed(1) ?? '—'}
              unit="%"
              icon={TrendingUp}
              accent="green"
            />
            <StatCard
              label="Detection Runs"
              value="—"
              icon={Activity}
              accent="indigo"
            />
          </div>

          {/* CTA */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
            <h2 className="text-xl font-semibold text-slate-800">
              Ready to run a new detection?
            </h2>
            <p className="text-slate-500 max-w-md">
              Upload an image or video, select a model, and our AI will detect
              vehicles, helmets, and other road safety features automatically.
            </p>
            <Link
              to="/detect/manual"
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 hover:shadow-md transition-all"
            >
              Start Manual Detection
            </Link>
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
