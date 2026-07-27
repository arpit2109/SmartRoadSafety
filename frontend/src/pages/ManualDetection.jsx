import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const ManualDetection = () => {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(null);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await api.get('/api/ai/models/dropdown/');
        setModels(res.data);
        setModelsError(null);
      } catch (err) {
        console.error('Failed to load models:', err);
        setModelsError('Could not load models. Is the backend running?');
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResult(null);
    }
  };

  const handleDetect = useCallback(async () => {
    if (!file || !selectedModelId) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('model_id', selectedModelId);

    try {
      const response = await api.post(
        '/api/detection/image/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(response.data);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.response?.status === 404
          ? 'Model not found. It may have been deactivated.'
          : 'Detection failed. Check the backend is running.');
      alert(msg);
    } finally {
      setLoading(false);
    }
  }, [file, selectedModelId]);

  const canDetect = Boolean(file && selectedModelId && !loading && !modelsLoading);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Manual Detection</h1>

      {modelsError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {modelsError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Upload Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Upload Source
          </h2>

          {/* Model selector — replaces the old category dropdown */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              AI Model
            </label>
            {modelsLoading ? (
              <div className="w-full bg-slate-50 border border-slate-300 text-slate-400 text-sm rounded-lg p-2.5">
                Loading models...
              </div>
            ) : models.length === 0 ? (
              <div className="w-full bg-slate-50 border border-slate-300 text-slate-500 text-sm rounded-lg p-2.5">
                No active models available. Ask an admin to register one.
              </div>
            ) : (
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
              >
                <option value="">-- Select a model --</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} v{m.version}
                    {m.is_default ? ' (default)' : ''}
                    {' '}
                    <span className="text-slate-400">[{m.category}]</span>
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Upload Image
            </label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
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

          <button
            onClick={handleDetect}
            disabled={!canDetect}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium shadow-sm transition-all ${
              !canDetect
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
            }`}
          >
            {loading ? 'Processing...' : 'Run Detection'}
          </button>
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

          {result && (
            <div className="space-y-3">
              {/* Model used */}
              {result.model && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm">
                  <span className="font-semibold text-blue-900">Model:</span>{' '}
                  <span className="text-blue-800">
                    {result.model.name} v{result.model.version}
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
                <p className="text-blue-700 text-xs mt-1">
                  Processing time: {result.processing_time}s &nbsp;|&nbsp; Confidence
                  used: {(result.confidence_used * 100).toFixed(1)}%
                </p>
                {result.detections?.length > 0 && (
                  <div className="mt-2 text-sm text-blue-800 max-h-32 overflow-y-auto">
                    <ul className="list-disc pl-5">
                      {result.detections.map((det, i) => (
                        <li key={i}>
                          {det.class_name} (
                          {(det.confidence * 100).toFixed(1)}%)
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

export default ManualDetection;
