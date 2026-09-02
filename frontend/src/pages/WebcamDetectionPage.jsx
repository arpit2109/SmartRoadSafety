import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, CameraOff, AlertCircle, Wifi, WifiOff, Clock, Zap, Activity, BarChart3 } from 'lucide-react';
import api from '../services/api';

/**
 * WebcamDetectionPage — rebuilt for lower latency.
 *
 * Key changes
 * -----------
 * - Send loop (setInterval @ 80ms) is completely separate from draw loop (RAF @ 60fps).
 *   Previously both were tangled in a single RAF loop, causing frame sends to be gated
 *   by the draw rate.
 * - Send resolution capped at 640px wide (down from full 1280px). Halves encode size.
 * - Blobs sent directly (no .arrayBuffer() hop).
 * - avg_inference_ms displayed in the stats bar.
 * - dropped_frames counter shown so users understand when the server is under load.
 */

const SEND_WIDTH = 640;   // max pixel width sent to server
const SEND_INTERVAL_MS = 80; // ~12 fps upload rate

const PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
const classColor = (cls) => {
  let h = 0;
  for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

const StatBadge = ({ label, value, unit = '', color = 'text-slate-700' }) => (
  <div className="flex flex-col items-center bg-slate-50 rounded-lg px-3 py-2 min-w-[80px]">
    <span className={`text-lg font-bold font-mono ${color}`}>{value}</span>
    <span className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
    {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
  </div>
);

const WebcamDetectionPage = () => {
  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const wsRef = useRef(null);
  const lastBoxesRef = useRef([]);
  const sendIntervalRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const fpsRef = useRef({ in: 0, out: 0, lastIn: Date.now(), lastOut: Date.now() });

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [wsStatus, setWsStatus] = useState('idle');
  const [wsError, setWsError] = useState('');
  const [activeModel, setActiveModel] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [objectCount, setObjectCount] = useState(0);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [avgInferenceMs, setAvgInferenceMs] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [fpsIn, setFpsIn] = useState(0);
  const [fpsOut, setFpsOut] = useState(0);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [webcamVerified, setWebcamVerified] = useState(false);

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

  useEffect(() => () => stopAll(), []);

  const stopAll = useCallback(() => {
    runningRef.current = false;
    if (sendIntervalRef.current) { clearInterval(sendIntervalRef.current); sendIntervalRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null);
    setIsStreaming(false);
    setWsStatus('idle');
    setActiveModel(null);
    setObjectCount(0);
    lastBoxesRef.current = [];
    setWebcamVerified(false);
  }, [stream]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setWebcamVerified(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      if (err.name === 'NotAllowedError') setCameraError('Camera access denied. Please allow camera permissions.');
      else if (err.name === 'NotFoundError') setCameraError('No camera found on this device.');
      else setCameraError(`Camera error: ${err.message}`);
    }
  }, []);

  // ── Draw loop — runs at 60fps, purely for rendering boxes ──────────
  const startDrawLoop = useCallback(() => {
    const draw = () => {
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !overlay || !runningRef.current) { rafRef.current = null; return; }

      const W = video.videoWidth;
      const H = video.videoHeight;
      if (W && H) {
        if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        const boxes = lastBoxesRef.current;
        
        const sw = Math.min(W, SEND_WIDTH);
        const sh = Math.round(sw * (H / W));
        const scaleX = W / sw;
        const scaleY = H / sh;

        for (const box of boxes) {
          const x = box.x1 * scaleX, y = box.y1 * scaleY, w = (box.x2 - box.x1) * scaleX, h = (box.y2 - box.y1) * scaleY;
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
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // ── Send loop — fires every 80ms, independent of draw loop ─────────
  const startSendLoop = useCallback((ws) => {
    sendIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const capture = captureCanvasRef.current;
      if (!video || !capture || !runningRef.current) return;
      if (!ws || ws.readyState !== 1) return;
      const W = video.videoWidth;
      const H = video.videoHeight;
      if (!W || !H) return;

      // Scale down to SEND_WIDTH, keep aspect ratio
      const sw = Math.min(W, SEND_WIDTH);
      const sh = Math.round(sw * (H / W));
      if (capture.width !== sw || capture.height !== sh) { capture.width = sw; capture.height = sh; }

      const ctx = capture.getContext('2d');
      ctx.drawImage(video, 0, 0, sw, sh);
      // Send blob directly — no .arrayBuffer() hop needed
      capture.toBlob(blob => {
        if (blob && ws.readyState === 1) {
          ws.send(blob);
          fpsRef.current.out += 1;
          const t = Date.now();
          if (t - fpsRef.current.lastOut >= 1000) {
            setFpsOut(fpsRef.current.out);
            fpsRef.current.out = 0;
            fpsRef.current.lastOut = t;
          }
        }
      }, 'image/jpeg', 0.5);
    }, SEND_INTERVAL_MS);
  }, []);

  const startStreaming = useCallback(() => {
    if (!stream || !selectedModelId) return;
    const token = localStorage.getItem('access');
    if (!token) { setWsError('No auth token. Please log in again.'); return; }

    setWsError('');
    setWsStatus('connecting');

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/$/, '');
    const url = `${wsBase}/ws/detection/webcam/?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => { setWsStatus('open'); ws.send(JSON.stringify({ type: 'config', model_id: selectedModelId })); };
    ws.onerror = () => { setWsStatus('error'); setWsError('WebSocket connection failed.'); };
    ws.onclose = () => setWsStatus('closed');

    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      fpsRef.current.in += 1;
      const t = Date.now();
      if (t - fpsRef.current.lastIn >= 1000) {
        setFpsIn(fpsRef.current.in);
        fpsRef.current.in = 0;
        fpsRef.current.lastIn = t;
      }

      if (msg.type === 'configured') {
        setActiveModel(msg.model);
        setIsStreaming(true);
        runningRef.current = true;
        startDrawLoop();
        startSendLoop(ws);
      } else if (msg.type === 'boxes') {
        lastBoxesRef.current = msg.boxes;
        setObjectCount(msg.object_count);
        setInferenceMs(msg.inference_time_ms);
        setAvgInferenceMs(msg.avg_inference_ms);
        setDroppedFrames(msg.dropped_frames);
      } else if (msg.type === 'error') {
        setWsError(msg.message);
      } else if (msg.type === 'stopped') {
        setIsStreaming(false);
      }
    };
  }, [stream, selectedModelId, startDrawLoop, startSendLoop]);

  const stopStreaming = useCallback(() => {
    runningRef.current = false;
    if (sendIntervalRef.current) { clearInterval(sendIntervalRef.current); sendIntervalRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'stop' }));
    setIsStreaming(false);
    lastBoxesRef.current = [];
    setObjectCount(0);
  }, []);

  const isLive = wsStatus === 'open';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Camera size={24} className="text-emerald-500" />
          Live Webcam Detection
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time YOLO inference via WebSocket — boxes drawn at 60fps.
        </p>
      </div>

      {/* Controls bar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3">
        {!stream ? (
          <button id="btn-start-camera" onClick={startCamera}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm">
            <Camera size={16} /> Start Camera
          </button>
        ) : (
          <button id="btn-stop-camera" onClick={stopAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-red-500 hover:bg-red-600 transition-colors shadow-sm">
            <CameraOff size={16} /> Stop Camera
          </button>
        )}

        {stream && !webcamVerified && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 ml-2">Is the webcam working properly?</span>
            <button onClick={() => setWebcamVerified(true)}
              className="px-4 py-2 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm text-sm">
              Yes, continue
            </button>
            <button onClick={() => { stopAll(); startCamera(); }}
              className="px-4 py-2 rounded-lg text-slate-700 font-medium bg-slate-100 hover:bg-slate-200 transition-colors shadow-sm border border-slate-200 text-sm">
              No, try again
            </button>
          </div>
        )}

        {stream && webcamVerified && (
          modelsLoading ? (
            <span className="text-sm text-slate-400 italic">Loading models…</span>
          ) : models.length === 0 ? (
            <span className="text-sm text-red-500">No models available.</span>
          ) : (
            <select id="select-model" value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)}
              className="text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name} v{m.version} [{m.category}]</option>
              ))}
            </select>
          )
        )}

        {stream && webcamVerified && !isStreaming && (
          <button id="btn-start-streaming" onClick={startStreaming} disabled={!selectedModelId || wsStatus === 'connecting'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <Wifi size={16} />
            {wsStatus === 'connecting' ? 'Connecting…' : 'Start Detection'}
          </button>
        )}

        {isStreaming && (
          <button id="btn-stop-streaming" onClick={stopStreaming}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-amber-500 hover:bg-amber-600 transition-colors shadow-sm">
            <WifiOff size={16} /> Stop Detection
          </button>
        )}

        {/* Connection status pill */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : wsStatus === 'error' ? 'bg-red-500' : 'bg-slate-300'}`} />
          <span className={`text-xs font-medium ${isLive ? 'text-emerald-600' : wsStatus === 'error' ? 'text-red-500' : 'text-slate-400'}`}>
            {isLive ? 'LIVE' : wsStatus === 'connecting' ? 'Connecting' : wsStatus === 'error' ? 'Error' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Error banners */}
      {cameraError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {cameraError}
        </div>
      )}
      {wsError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {wsError}
        </div>
      )}

      {/* Stats bar (visible only when streaming) */}
      {isStreaming && activeModel && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold text-slate-700">{activeModel.name}</span>
              <span className="text-slate-400 ml-1">v{activeModel.version}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatBadge label="Objects" value={objectCount} color="text-indigo-600" />
              <StatBadge label="Inference" value={inferenceMs} unit="ms" color="text-amber-600" />
              <StatBadge label="Avg Inference" value={avgInferenceMs} unit="ms" color="text-orange-500" />
              <StatBadge label="FPS In" value={fpsIn} color="text-emerald-600" />
              <StatBadge label="FPS Out" value={fpsOut} color="text-blue-600" />
              <StatBadge label="Dropped" value={droppedFrames} color={droppedFrames > 10 ? 'text-red-500' : 'text-slate-500'} />
            </div>
          </div>
        </div>
      )}

      {/* Video feed */}
      <div className="relative bg-slate-900 rounded-xl overflow-hidden shadow-lg" style={{ minHeight: 320 }}>
        <video ref={videoRef} autoPlay muted playsInline
          className="w-full h-full object-contain max-h-[520px]" />
        <canvas ref={overlayCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ objectFit: 'contain' }} />
        {/* Hidden capture canvas */}
        <canvas ref={captureCanvasRef} className="hidden" />

        {!stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Camera size={48} className="opacity-30" />
            <p className="text-sm">Click "Start Camera" to begin</p>
          </div>
        )}

        {stream && !isStreaming && (
          <div className="absolute top-3 left-3">
            <span className="text-xs bg-slate-800/80 text-slate-300 rounded px-2 py-1">
              {!webcamVerified ? 'Please verify webcam to proceed' : 'Camera ready — press Start Detection'}
            </span>
          </div>
        )}

        {isLive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/90 text-white text-xs font-bold px-2 py-1 rounded">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> LIVE
          </div>
        )}
      </div>
    </div>
  );
};

export default WebcamDetectionPage;
