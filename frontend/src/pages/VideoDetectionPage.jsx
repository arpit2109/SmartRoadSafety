import React, { useState, useEffect, useCallback } from 'react';
import { Video, AlertCircle } from 'lucide-react';
import api from '../services/api';

/**
 * VideoDetectionPage
 *
 * Upload a video file and run detection on sampled frames.
 */
const VideoDetectionPage = () => {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await api.get('/api/ai/models/dropdown/');
        setModels(res.data);
        setModelsError(null);
      } catch {
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
      setError('');
    }
  };

  const handleDetect = useCallback(async () => {
    if (!file || !selectedModelId) return;

    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('video', file);
    formData.append('model_id', selectedModelId);

    try {
      const response = await api.post(
        '/api/detection/video/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(response.data);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Video detection failed. Check the backend is running.'
      );
    } finally {
      setLoading(false);
    }
  }, [file, selectedModelId]);

  const canDetect = Boolean(file && selectedModelId && !loading && !modelsLoading);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Video size={24} className="text-indigo-500" />
          Video Detection
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload a video — we'll run detection on sampled frames and give you a summary.
        </p>
      </div>

      {modelsError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {modelsError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Config / Upload Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Video & Model
          </h2>

          {/* Model selector */}
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
                No active models available.
              </div>
            ) : (
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
              >
                <option value="">-- Select a model --</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} v{m.version}{' '}
                    <span className="text-slate-400">[{m.category}]</span>
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Upload Video
            </label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <p className="mb-2 text-sm text-slate-500">
                    <span className="font-semibold">Click to upload</span>{' '}
                    or drag and drop
                  </p>
                  <p className="text-xs text-slate-500">
                    MP4, AVI, MOV, MKV, WMV
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="video/mp4,video/x-msvideo,video/quicktime,video/x-matroska,video/x-ms-wmv"
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
            disabled={!canDetect}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium shadow-sm transition-all flex items-center justify-center gap-2 ${
              !canDetect
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'
            }`}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing frames...
              </>
            ) : (
              <>
                <Video size={16} />
                Run Video Detection
              </>
            )}
          </button>

          <p className="text-xs text-slate-400 text-center">
            Every 10th frame is processed to keep response time reasonable.
          </p>
        </div>

        {/* Results Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Results
          </h2>

          {/* Annotated frame preview */}
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative min-h-[300px]">
            {result?.annotated_frame_base64 ? (
              <img
                src={`data:image/jpeg;base64,${result.annotated_frame_base64}`}
                alt="Most-detected frame"
                className="max-h-full max-w-full object-contain"
              />
            ) : preview ? (
              <video
                src={preview}
                controls
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-slate-400">Video preview will appear here</span>
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
              {/* Model used */}
              {result.model && (
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-sm">
                  <span className="font-semibold text-indigo-900">Model:</span>{' '}
                  <span className="text-indigo-800">
                    {result.model.name} v{result.model.version}
                  </span>
                  <span className="ml-2 text-indigo-600 text-xs uppercase">
                    [{result.model.category}]
                  </span>
                </div>
              )}

              {/* Summary */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-2">
                <h3 className="font-semibold text-blue-900">Detection Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
                  <div>
                    Frames processed: <strong>{result.total_frames_processed}</strong>
                  </div>
                  <div>
                    Frames w/ detections: <strong>{result.frames_with_detections}</strong>
                  </div>
                  <div>
                    Total objects: <strong>{result.total_object_detections}</strong>
                  </div>
                  <div>
                    Inference: <strong>{result.processing_time}s</strong>
                  </div>
                </div>

                {result.top_classes?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-blue-700 mb-1">
                      Top detected classes:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.top_classes.map((item, i) => (
                        <span
                          key={i}
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full"
                        >
                          {item.class_name}{' '}
                          <strong>{item.count}</strong>
                        </span>
                      ))}
                    </div>
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

export default VideoDetectionPage;
