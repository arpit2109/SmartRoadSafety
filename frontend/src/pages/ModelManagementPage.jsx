/**
 * ModelManagementPage — /models
 *
 * Lists all AIModels with filters, status badges, and row actions:
 *   GET  /api/ai/models/              → paginated list
 *   POST /api/ai/models/<id>/activate/
 *   POST /api/ai/models/<id>/deactivate/
 *   POST /api/ai/models/<id>/set-default/
 *   DELETE /api/ai/models/<id>/        → soft-delete
 *   GET  /api/ai/models/categories/   → filter options
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Star,
  AlertCircle,
  Cpu,
  ShieldOff,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../hooks/useToast';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const ActiveBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
    Active
  </span>
);

const InactiveBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
    Inactive
  </span>
);

const DefaultBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
    <Star size={10} />
    Default
  </span>
);

const CategoryBadge = ({ cat }) => (
  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 capitalize">
    {cat}
  </span>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ModelManagementPage = () => {
  const { user } = useAuth();
  const { toast, dismiss, toasts } = useToast();
  const navigate = useNavigate();

  const isAdmin = user?.is_staff === true;

  const [models, setModels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // pk of model being acted on

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'active' | 'inactive'

  // Fetch categories + models in parallel
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter === 'active') params.is_active = 'true';
      if (statusFilter === 'inactive') params.is_active = 'false';

      const [catRes, modelRes] = await Promise.all([
        api.get('/api/ai/models/categories/'),
        api.get('/api/ai/models/', { params }),
      ]);
      setCategories(catRes.data);
      setModels(modelRes.data);
    } catch {
      toast('Failed to load models.', 'error');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Filter client-side for search
  const filtered = models.filter((m) =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.version.toLowerCase().includes(search.toLowerCase())
  );

  // -------------------------------------------------------------------------
  // Row actions
  // -------------------------------------------------------------------------

  const doAction = async (pk, action, method = 'post', successMsg) => {
    setActionLoading(pk);
    try {
      await api[method](`/api/ai/models/${pk}/${action}`);
      toast(successMsg, 'success');
      await load();
    } catch (err) {
      toast(err.response?.data?.detail || `${action} failed.`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = (pk) =>
    doAction(pk, 'activate/', 'post', 'Model activated.');
  const handleDeactivate = (pk) =>
    doAction(pk, 'deactivate/', 'post', 'Model deactivated.');
  const handleSetDefault = (pk) =>
    doAction(pk, 'set-default/', 'post', 'Set as default.');
  const handleDelete = (pk, name) => {
    if (!window.confirm(`Soft-delete "${name}"? It will become inactive.`)) return;
    doAction(pk, '', 'delete', 'Model deleted.', );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <ShieldOff size={48} className="text-slate-300 mb-4" />
        <h2 className="text-lg font-semibold text-slate-700">Admin Access Required</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-sm">
          Model management is only available to administrators. Contact your admin to grant access.
        </p>
        <Link to="/" className="mt-6 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Model Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            {models.length} model{models.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link
          to="/models/upload"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
        >
          <PlusCircle size={16} />
          Upload Model
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus-within:border-blue-400 focus-within:bg-white transition-colors">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name or version…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-slate-700 placeholder-slate-400 w-full focus:outline-none"
          />
        </div>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-slate-50 focus:border-blue-400 focus:bg-white focus:outline-none cursor-pointer"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category.charAt(0).toUpperCase() + c.category.slice(1)} ({c.active_count} active)
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-slate-50 focus:border-blue-400 focus:bg-white focus:outline-none cursor-pointer"
        >
          <option value="">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Cpu size={40} className="text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No models found</p>
            <p className="text-xs text-slate-400 mt-1">Upload a model to get started.</p>
            <Link
              to="/models/upload"
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              Upload Model
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Name', 'Version', 'Category', 'Status', 'Accuracy', 'Default', 'Uploaded', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{m.version}</td>
                    <td className="px-4 py-3"><CategoryBadge cat={m.category} /></td>
                    <td className="px-4 py-3">
                      {m.is_active ? <ActiveBadge /> : <InactiveBadge />}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {m.is_default && <DefaultBadge />}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Activate */}
                        {!m.is_active && (
                          <ActionBtn
                            icon={<CheckCircle size={14} />}
                            label="Activate"
                            variant="success"
                            loading={actionLoading === m.id}
                            onClick={() => handleActivate(m.id)}
                          />
                        )}
                        {/* Deactivate */}
                        {m.is_active && (
                          <ActionBtn
                            icon={<XCircle size={14} />}
                            label="Deactivate"
                            variant="danger"
                            loading={actionLoading === m.id}
                            onClick={() => handleDeactivate(m.id)}
                          />
                        )}
                        {/* Set default */}
                        {m.is_active && !m.is_default && (
                          <ActionBtn
                            icon={<Star size={14} />}
                            label="Set Default"
                            variant="warning"
                            loading={actionLoading === m.id}
                            onClick={() => handleSetDefault(m.id)}
                          />
                        )}
                        {/* Delete */}
                        <ActionBtn
                          icon={<Trash2 size={14} />}
                          label="Delete"
                          variant="ghost"
                          loading={actionLoading === m.id}
                          onClick={() => handleDelete(m.id, m.name)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Action button
// ---------------------------------------------------------------------------

const ActionBtn = ({ icon, label, variant, loading, onClick }) => {
  const cls = {
    success: 'text-green-600 hover:bg-green-50 border-green-200',
    danger: 'text-red-600 hover:bg-red-50 border-red-200',
    warning: 'text-amber-600 hover:bg-amber-50 border-amber-200',
    ghost: 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 border-transparent',
  }[variant];

  return (
    <button
      type="button"
      title={label}
      disabled={loading}
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 border rounded text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {loading ? <RefreshCw size={12} className="animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

export default ModelManagementPage;
