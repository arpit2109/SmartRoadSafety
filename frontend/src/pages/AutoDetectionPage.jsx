import React, { useState, useCallback } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import api from '../services/api';

/**
 * AutoDetectionPage
 *
 * Upload an image and let the system automatically pick the best
 * model by running a quick multi-model sweep.
 */
const AutoDetectionPage = () => {
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
      setError(
        err.response?.data?.error ||
        (err.response?.status === 404
          ? 'No models available. Ask an admin to register one.'
          : 'Auto-detection failed. Check the backend is running.')
      );
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Sparkles size={24} className="text-amber-500" />
          Auto Detection
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload any image — we'll automatically pick the best model for you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Upload Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Upload Image
          </h2>

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
            <p className="text-xs text-slate-500 truncate">
              Selected: {file.name}
            </p>
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

        {/* Preview / Results Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Results
          </h2>

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
              <span className="text-slate-400">
                Image preview will appear here
              </span>
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
              {/* Auto-selected model */}
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

              {/* Detection summary */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h3 className="font-semibold text-blue-900">Detection Summary</h3>
                <p className="text-blue-800 mt-1">
                  Objects Detected:{' '}
                  <strong>{result.object_count}</strong>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoDetectionPage;
