import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import api from '../services/api';

/**
 * VideoDetectionPage — live preview via WebSocket box streaming.
 *
 * Flow:
 *   1. User selects model + video file
 *   2. POST /api/detection/video-stream/ → returns {session_id, video_url, websocket_url}
 *   3. Frontend connects to WebSocket; backend starts processing in background
 *   4. Each "frame" message contains boxes (x1, y1, x2, y2, class, conf)
 *   5. We render those boxes on a <canvas> overlay synced to video.currentTime
 *
 * Bandwidth: ~1-2 KB/frame vs ~30-50 KB/frame for MJPEG.
 */
const VideoDetectionPage = () => {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(null);

  // Live session state
  const [videoUrl, setVideoUrl] = useState(null);
  const [wsStatus, setWsStatus] = useState('idle'); // 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  const [started, setStarted] = useState(null); // model + total frames
  const [complete, setComplete] = useState(null);
  const [liveObjectCount, setLiveObjectCount] = useState(0);
  const [fpsIn, setFpsIn] = useState(0); // frames received per second

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const framesRef = useRef(new Map()); // frame_index → boxes
  const fpsCounterRef = useRef({ count: 0, last: Date.now() });

  // Fetch models
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

  // Cleanup WebSocket on unmount
  useEffect(() => () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Canvas redraw loop — reads from framesRef, syncs to video.currentTime
  useEffect(() => {
    if (!videoUrl) return;
    let rafId;
    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        const W = video.videoWidth;
        const H = video.videoHeight;
        if (W && H) {
          if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
          }
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Find the latest frame whose timestamp is <= current playback time
          const currentMs = video.currentTime * 1000;
          const frames = framesRef.current;
          let bestFrame = null;
          let bestTs = -1;
          for (const [, f] of frames) {
            if (f.timestamp_ms <= currentMs && f.timestamp_ms > bestTs) {
              bestTs = f.timestamp_ms;
              bestFrame = f;
            }
          }
          if (bestFrame) {
            // Color palette (deterministic per class)
            const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
            const classColor = (cls) => {
              let hash = 0;
              for (let i = 0; i < cls.length; i++) hash = (hash * 31 + cls.charCodeAt(i)) | 0;
              return palette[Math.abs(hash) % palette.length];
            };

            for (const box of bestFrame.boxes) {
              const x = box.x1;
              const y = box.y1;
              const w = box.x2 - box.x1;
              const h = box.y2 - box.y1;
              const color = classColor(box.class_name);
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, w, h);
              // Label
              const label = `${box.class_name} ${(box.confidence * 100).toFixed(0)}%`;
              ctx.font = 'bold 18px sans-serif';
              const tw = ctx.measureText(label).width;
              ctx.fillStyle = color;
              ctx.fillRect(x, y - 26, tw + 12, 26);
              ctx.fillStyle = '#fff';
              ctx.fillText(label, x + 6, y - 7);
            }
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [videoUrl]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError('');
      setVideoUrl(null);
      setComplete(null);
      setStarted(null);
      framesRef.current.clear();
      setLiveObjectCount(0);
      setFpsIn(0);
    }
  };

  const handleDetect = useCallback(async () => {
    if (!file || !selectedModelId) return;
    setLoading(true);
    setError('');
    setVideoUrl(null);
    setComplete(null);
    setStarted(null);
    framesRef.current.clear();
    setLiveObjectCount(0);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('model_id', selectedModelId);

    try {
      const res = await api.post('/api/detection/video-stream/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { session_id, websocket_url, video_url } = res.data;
      setVideoUrl(video_url);

      // Build WebSocket URL (use ws:// or wss:// depending on page protocol)
      const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsFullUrl = `${wsScheme}//${wsHost}${websocket_url}`;

      setWsStatus('connecting');
      const ws = new WebSocket(wsFullUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus('open');
      ws.onerror = () => {
        setWsStatus('error');
        setError('WebSocket connection failed.');
      };
      ws.onclose = () => setWsStatus('closed');
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        // FPS counter
        fpsCounterRef.current.count += 1;
        const now = Date.now();
        if (now - fpsCounterRef.current.last >= 1000) {
          setFpsIn(fpsCounterRef.current.count);
          fpsCounterRef.current.count = 0;
          fpsCounterRef.current.last = now;
        }

        if (msg.type === 'ready' || msg.type === 'started') {
          setStarted(msg);
        } else if (msg.type === 'frame') {
          framesRef.current.set(msg.frame_index, msg);
          setLiveObjectCount(msg.object_count);
        } else if (msg.type === 'complete') {
          setComplete(msg);
          setWsStatus('closed');
        } else if (msg.type === 'error') {
          setError(msg.message);
          setWsStatus('error');
        }
      };
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Could not start video processing. Is the backend running?'
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
          Video Detection (Live Preview)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Live bounding boxes streamed from the server via WebSocket — only box JSON, not full frames.
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
            <p className="text-xs text-slate-500 truncate">Selected: {file.name}</p>
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
                Starting...
              </>
            ) : (
              <>
                <Video size={16} />
                Start Live Detection
              </>
            )}
          </button>
        </div>

        {/* Live preview / Results Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-semibold text-slate-800">
              Live Preview
            </h2>
            <div className="flex items-center gap-2 text-xs">
              {wsStatus === 'open' && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Wifi size={14} /> Live
                </span>
              )}
              {(wsStatus === 'closed' || wsStatus === 'idle') && !videoUrl && (
                <span className="flex items-center gap-1 text-slate-400">
                  <WifiOff size={14} /> Idle
                </span>
              )}
              {wsStatus === 'error' && (
                <span className="flex items-center gap-1 text-red-500">
                  <WifiOff size={14} /> Error
                </span>
              )}
              {wsStatus === 'open' && (
                <span className="text-slate-500 font-mono">{fpsIn} fps in</span>
              )}
            </div>
          </div>

          {/* Video + canvas overlay */}
          <div className="relative bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center min-h-[320px]">
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  autoPlay
                  muted
                  className="max-h-[480px] w-auto object-contain"
                  onLoadedMetadata={() => {
                    if (videoRef.current && canvasRef.current) {
                      canvasRef.current.width = videoRef.current.videoWidth;
                      canvasRef.current.height = videoRef.current.videoHeight;
                    }
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ objectFit: 'contain' }}
                />
              </>
            ) : (
              <span className="text-slate-400 py-12">Upload and start to see live preview</span>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Live stats bar */}
          {started && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm bg-slate-50 rounded-lg px-4 py-2">
              <span>
                <strong>{started.model?.name}</strong> v{started.model?.version}
              </span>
              <span>
                Frames: <strong>{started.total_frames}</strong>
              </span>
              <span>
                Sample: 1/{started.frame_sample_rate}
              </span>
              <span>
                Live objects: <strong>{liveObjectCount}</strong>
              </span>
            </div>
          )}

          {/* Completion summary */}
          {complete && (
            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200 space-y-2">
              <h3 className="font-semibold text-emerald-900">Processing complete</h3>
              <div className="grid grid-cols-2 gap-2 text-sm text-emerald-800">
                <div>
                  Total frames: <strong>{complete.total_frames_processed}</strong>
                </div>
                <div>
                  Frames w/ detections:{' '}
                  <strong>{complete.frames_with_detections}</strong>
                </div>
                <div>
                  Total objects:{' '}
                  <strong>{complete.total_object_detections}</strong>
                </div>
                <div>
                  Elapsed: <strong>{complete.elapsed}s</strong>
                </div>
              </div>
              {complete.top_classes?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">
                    Top detected classes:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {complete.top_classes.map((item, i) => (
                      <span
                        key={i}
                        className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full"
                      >
                        {item.class_name} <strong>{item.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoDetectionPage;
