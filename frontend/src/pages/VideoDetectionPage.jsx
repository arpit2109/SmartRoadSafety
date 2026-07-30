import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video, AlertCircle, Wifi, WifiOff, Clock, Activity } from 'lucide-react';
import api from '../services/api';

/**
 * VideoDetectionPage — rebuilt for lower latency.
 *
 * Key changes
 * -----------
 * - FRAME_SAMPLE_RATE on the server is now 3 (every 3rd frame) vs 10.
 * - Progress bar driven by the "progress" field in each frame message.
 * - avg_inference_ms shown in the stats bar.
 * - Box lookup uses a timestamp map keyed by timestamp_ms for O(1) access.
 * - Separate RAF draw loop syncs box overlay to video.currentTime continuously.
 */

const PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
const classColor = (cls) => {
  let h = 0;
  for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

const drawBoxes = (ctx, boxes, W, H) => {
  ctx.clearRect(0, 0, W, H);
  for (const box of boxes) {
    const x = box.x1, y = box.y1, w = box.x2 - box.x1, h = box.y2 - box.y1;
    const color = classColor(box.class_name);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);
    const label = `${box.class_name} ${(box.confidence * 100).toFixed(0)}%`;
    ctx.font = 'bold 13px Inter,system-ui,sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 21), tw + 10, 21);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 5, Math.max(15, y - 5));
  }
};

const StatBadge = ({ label, value, unit = '', color = 'text-slate-700' }) => (
  <div className="flex flex-col items-center bg-slate-50 rounded-lg px-3 py-2 min-w-[80px]">
    <span className={`text-lg font-bold font-mono ${color}`}>{value}</span>
    <span className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
    {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
  </div>
);

const VideoDetectionPage = () => {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);

  const [videoUrl, setVideoUrl] = useState(null);
  const [wsStatus, setWsStatus] = useState('idle');
  const [started, setStarted] = useState(null);
  const [complete, setComplete] = useState(null);
  const [liveObjectCount, setLiveObjectCount] = useState(0);
  const [liveInferenceMs, setLiveInferenceMs] = useState(0);
  const [avgInferenceMs, setAvgInferenceMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fpsIn, setFpsIn] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  // Map of timestamp_ms -> {boxes, object_count}
  const framesRef = useRef(new Map());
  // Sorted list of timestamp keys for binary-search lookup
  const tsKeysRef = useRef([]);
  const rafRef = useRef(null);
  const fpsRef = useRef({ count: 0, last: Date.now() });

  // Fetch models
  useEffect(() => {
    api.get('/api/ai/models/dropdown/')
      .then(res => {
        setModels(res.data);
        if (res.data.length > 0) setSelectedModelId(String(res.data[0].id));
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  // Cleanup WS on unmount
  useEffect(() => () => { if (wsRef.current) wsRef.current.close(); }, []);

  // ── Canvas draw loop — syncs boxes to video.currentTime ────────────
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
          if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
          const ctx = canvas.getContext('2d');
          const currentMs = video.currentTime * 1000;
          const keys = tsKeysRef.current;

          // Binary search for closest frame at or before currentTime
          let lo = 0, hi = keys.length - 1, best = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (keys[mid] <= currentMs) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
          }

          if (best >= 0) {
            const frame = framesRef.current.get(keys[best]);
            drawBoxes(ctx, frame.boxes, W, H);
          } else {
            ctx.clearRect(0, 0, W, H);
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    rafRef.current = rafId;
    return () => cancelAnimationFrame(rafId);
  }, [videoUrl]);

  const reset = () => {
    setVideoUrl(null);
    setComplete(null);
    setStarted(null);
    setProgress(0);
    setLiveObjectCount(0);
    setLiveInferenceMs(0);
    setAvgInferenceMs(0);
    framesRef.current.clear();
    tsKeysRef.current = [];
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) { setFile(f); setError(''); reset(); }
  };

  const handleDetect = useCallback(async () => {
    if (!file || !selectedModelId) return;
    setLoading(true);
    setError('');
    reset();

    const formData = new FormData();
    formData.append('video', file);
    formData.append('model_id', selectedModelId);

    try {
      const res = await api.post('/api/detection/video-stream/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { websocket_url, video_url } = res.data;
      setVideoUrl(video_url);

      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const wsFullUrl = apiBase.replace(/^http/, 'ws').replace(/\/$/, '') + websocket_url;

      setWsStatus('connecting');
      const ws = new WebSocket(wsFullUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus('open');
      ws.onerror = () => { setWsStatus('error'); setError('WebSocket connection failed.'); };
      ws.onclose = () => setWsStatus('closed');

      ws.onmessage = event => {
        const msg = JSON.parse(event.data);

        // FPS counter
        fpsRef.current.count += 1;
        const t = Date.now();
        if (t - fpsRef.current.last >= 1000) {
          setFpsIn(fpsRef.current.count);
          fpsRef.current.count = 0;
          fpsRef.current.last = t;
        }

        if (msg.type === 'ready' || msg.type === 'started') {
          setStarted(msg);
        } else if (msg.type === 'frame') {
          // Store frame by timestamp
          framesRef.current.set(msg.timestamp_ms, { boxes: msg.boxes });
          // Insert key into sorted array (frames arrive roughly in order)
          const keys = tsKeysRef.current;
          if (keys.length === 0 || msg.timestamp_ms > keys[keys.length - 1]) {
            keys.push(msg.timestamp_ms);
          } else {
            // Insert in sorted position (handles rare out-of-order arrivals)
            let lo = 0, hi = keys.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < msg.timestamp_ms) lo = mid + 1; else hi = mid; }
            if (keys[lo] !== msg.timestamp_ms) keys.splice(lo, 0, msg.timestamp_ms);
          }
          setLiveObjectCount(msg.object_count);
          setLiveInferenceMs(msg.inference_time_ms);
          setAvgInferenceMs(msg.avg_inference_ms);
          setProgress(msg.progress || 0);
        } else if (msg.type === 'complete') {
          setComplete(msg);
          setWsStatus('closed');
          setProgress(100);
          if (msg.avg_inference_ms) setAvgInferenceMs(msg.avg_inference_ms);
        } else if (msg.type === 'error') {
          setError(msg.message);
          setWsStatus('error');
        }
      };
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start video processing.');
    } finally {
      setLoading(false);
    }
  }, [file, selectedModelId]);

  const canDetect = Boolean(file && selectedModelId && !loading && !modelsLoading);
  const isLive = wsStatus === 'open';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Video size={24} className="text-indigo-500" />
          Video Detection (Live Preview)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Bounding boxes streamed via WebSocket — server analyzes every 3rd frame.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config panel */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-700 border-b pb-2">Video & Model</h2>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">AI Model</label>
            {modelsLoading ? (
              <div className="text-sm text-slate-400 italic">Loading models…</div>
            ) : models.length === 0 ? (
              <div className="text-sm text-red-500">No active models available.</div>
            ) : (
              <select id="select-model" value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">-- Select a model --</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name} v{m.version} [{m.category}]</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Upload Video</label>
            <label id="label-upload" className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
              <div className="text-center">
                <p className="text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-slate-400 mt-1">MP4, AVI, MOV, MKV, WMV</p>
              </div>
              <input id="input-video" type="file" className="hidden"
                accept="video/mp4,video/x-msvideo,video/quicktime,video/x-matroska,video/x-ms-wmv"
                onChange={handleFileChange} />
            </label>
            {file && <p className="text-xs text-slate-500 mt-1.5 truncate">Selected: {file.name}</p>}
          </div>

          <button id="btn-start-detection" onClick={handleDetect} disabled={!canDetect}
            className={`w-full py-2.5 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2 ${
              !canDetect ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow-md'
            }`}>
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Starting…</>
            ) : (
              <><Video size={16} /> Start Live Detection</>
            )}
          </button>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-base font-semibold text-slate-700">Live Preview</h2>
            <div className="flex items-center gap-2">
              {isLive && <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><Wifi size={13} /> Live</span>}
              {!isLive && wsStatus !== 'idle' && <span className="flex items-center gap-1 text-xs text-slate-400"><WifiOff size={13} /> {wsStatus}</span>}
              {isLive && <span className="text-xs text-slate-400 font-mono">{fpsIn} fps</span>}
            </div>
          </div>

          {/* Progress bar */}
          {(isLive || wsStatus === 'closed') && videoUrl && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Processing</span><span>{progress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Video + overlay */}
          <div className="relative bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center flex-1" style={{ minHeight: 240 }}>
            {videoUrl ? (
              <>
                <video ref={videoRef} src={videoUrl} controls autoPlay muted
                  className="max-h-[400px] w-auto object-contain"
                  onLoadedMetadata={() => {
                    if (videoRef.current && canvasRef.current) {
                      canvasRef.current.width = videoRef.current.videoWidth;
                      canvasRef.current.height = videoRef.current.videoHeight;
                    }
                  }} />
                <canvas ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ objectFit: 'contain' }} />
              </>
            ) : (
              <span className="text-slate-500 text-sm py-12">Upload and start to see live preview</span>
            )}
          </div>

          {/* Live stats */}
          {started && (
            <div className="flex flex-wrap gap-2 justify-center">
              <StatBadge label="Objects" value={liveObjectCount} color="text-indigo-600" />
              <StatBadge label="Inference" value={liveInferenceMs} unit="ms" color="text-amber-600" />
              <StatBadge label="Avg Inference" value={avgInferenceMs} unit="ms" color="text-orange-500" />
              <StatBadge label="FPS in" value={fpsIn} color="text-emerald-600" />
            </div>
          )}

          {/* Completion summary */}
          {complete && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
              <p className="font-semibold text-emerald-800 text-sm">Processing complete</p>
              <div className="grid grid-cols-2 gap-1 text-sm text-emerald-700">
                <div>Total frames: <strong>{complete.total_frames_processed}</strong></div>
                <div>Frames w/ detections: <strong>{complete.frames_with_detections}</strong></div>
                <div>Total objects: <strong>{complete.total_object_detections}</strong></div>
                <div>Elapsed: <strong>{complete.elapsed}s</strong></div>
                <div className="col-span-2">Avg inference: <strong>{complete.avg_inference_ms} ms/frame</strong></div>
              </div>
              {complete.top_classes?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 mb-1">Top classes:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {complete.top_classes.map((item, i) => (
                      <span key={i} className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
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
