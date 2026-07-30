import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertCircle, LogIn, UserPlus, LayoutDashboard } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * AutoDetectionPage
 *
 * Public landing page. Upload an image and let the system automatically
 * pick the best model by running a quick multi-model sweep.
 *
 * Anonymous users can use it directly (no login required). For logged-in
 * users, the result is also saved to their detection history.
 */
const AutoDetectionPage = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResult(null);
      setError('');
    }
  };

  const handleDetect = useCallback(async () => {
    if (!file) return;

    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await api.post(
        '/api/detection/auto/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(response.data);
    } catch (err) {
      const errMsg = err.response?.data?.error;
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in to use auto detection.');
      } else {
        setError(errMsg || 'Auto-detection failed. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50">
      {/* Top nav bar */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent leading-none">
                SmartRoadSafety
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">AI Detection Platform</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            {!isLoading && isAuthenticated && (
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <LayoutDashboard size={15} />
                Dashboard
              </Link>
            )}
            {!isLoading && !isAuthenticated && (
              <>
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <LogIn size={15} />
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors shadow-sm"
                >
                  <UserPlus size={15} />
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium mb-4">
          <Sparkles size={12} />
          No signup required
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
          Auto-detect road safety features
        </h2>
        <p className="text-slate-600 mt-2 max-w-xl mx-auto text-sm md:text-base">
          Upload an image and our AI picks the right model — helmets, vehicles,
          license plates, more. Results in seconds.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Upload Section */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2">
              Upload Image
            </h3>

            <div>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <p className="mb-2 text-sm text-slate-500">
                      <span className="font-semibold">Click to upload</span>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-slate-500">
                      JPEG, PNG, BMP, WebP
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>

            {file && (
              <p className="text-xs text-slate-500 truncate">Selected: {file.name}</p>
            )}

            <button
              onClick={handleDetect}
              disabled={!file || loading}
              className={`w-full py-3 px-4 rounded-lg text-white font-medium shadow-sm transition-all flex items-center justify-center gap-2 ${
                !file || loading
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 hover:shadow-md'
              }`}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning models...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Auto Detect
                </>
              )}
            </button>

            <p className="text-xs text-slate-400 text-center">
              Automatically selects the best model by running a quick multi-model sweep.
            </p>
          </div>

          {/* Results Section */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2">
              Results
            </h3>

            <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative min-h-[300px]">
              {result?.annotated_image_base64 ? (
                <img
                  src={`data:image/jpeg;base64,${result.annotated_image_base64}`}
                  alt="Detection result"
                  className="max-h-full max-w-full object-contain"
                />
              ) : preview ? (
                <img
                  src={preview}
                  alt="Upload preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-slate-400">Image preview will appear here</span>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-3">
                {result.selected_model && (
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm">
                    <span className="font-semibold text-amber-900">Auto-selected model:</span>{' '}
                    <span className="text-amber-800">
                      {result.selected_model.name} v{result.selected_model.version}
                    </span>
                    <span className="ml-2 text-amber-600 text-xs uppercase tracking-wide">
                      [{result.selected_model.category}]
                    </span>
                  </div>
                )}

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h4 className="font-semibold text-blue-900">Detection Summary</h4>
                  <p className="text-blue-800 mt-1">
                    Objects Detected: <strong>{result.object_count}</strong>
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-700 mt-2">
                    <span>
                      Inference: <strong>{result.processing_time}s</strong>
                    </span>
                    <span>
                      Conf. used: <strong>{(result.confidence_used * 100).toFixed(0)}%</strong>
                    </span>
                    <span>
                      IoU used: <strong>{(result.iou_used * 100).toFixed(0)}%</strong>
                    </span>
                  </div>
                  {result.detections?.length > 0 && (
                    <div className="mt-2 text-sm text-blue-800 max-h-32 overflow-y-auto">
                      <ul className="list-disc pl-5">
                        {result.detections.map((det, i) => (
                          <li key={i}>
                            {det.class_name} ({(det.confidence * 100).toFixed(1)}%)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {result.saved_to_history === false && (
                  <div className="bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                    <AlertCircle size={13} />
                    Not saved to history. <Link to="/register" className="text-amber-600 font-medium hover:underline">Sign up</Link> to keep your results.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoDetectionPage;
