import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, CameraOff, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import api from '../services/api';

/**
 * WebcamDetectionPage — live camera feed with WebSocket box streaming.
 *
 * Flow:
 *   1. Open camera via getUserMedia
 *   2. Open WebSocket to /ws/detection/webcam/ (with JWT token in query)
 *   3. Send {type:"config", model_id} to load the model
 *   4. Each frame: canvas → JPEG blob → WS binary → server
 *   5. Server runs YOLO, sends back {type:"boxes", boxes:[...]} JSON
 *   6. Browser draws boxes on a <canvas> overlay on top of the live <video>
 *
 * No video upload. No file storage. Pure live stream.
 */
const WS_FRAME_SEND_INTERVAL_MS = 200;  // throttle to ~5 fps upload

const WebcamDetectionPage = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const wsRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const lastBoxesRef = useRef([]);
  const fpsCounterRef = useRef({ in: 0, out: 0, lastIn: Date.now(), lastOut: Date.now() });
  const animationRef = useRef(null);
  const runningRef = useRef(false);

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [wsStatus, setWsStatus] = useState('idle'); // 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  const [wsError, setWsError] = useState('');
  const [activeModel, setActiveModel] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [objectCount, setObjectCount] = useState(0);
  const [latestBoxes, setLatestBoxes] = useState([]);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [fpsIn, setFpsIn] = useState(0);
  const [fpsOut, setFpsOut] = useState(0);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Fetch models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await api.get('/api/ai/models/dropdown/');
        setModels(res.data);
        if (res.data.length > 0) {
          setSelectedModelId(res.data[0].id);
        }
      } catch {
        // Non-fatal — page works without dropdown
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopAll(), []);

  const stopAll = useCallback(() => {
    runningRef.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setStream(null);
    setIsStreaming(false);
    setWsStatus('idle');
    setActiveModel(null);
    setObjectCount(0);
    setLatestBoxes([]);
    lastBoxesRef.current = [];
  }, [stream]);

  // ── Camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permissions.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopAll();
  }, [stopAll]);

  // ── WebSocket ───────────────────────────────────────────────────────
  const startStreaming = useCallback(() => {
    if (!stream || !selectedModelId) return;

    // Get JWT access token
    const token = localStorage.getItem('access');
    if (!token) {
      setWsError('No auth token found. Please log in again.');
      return;
    }

    setWsError('');
    setWsStatus('connecting');

    const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const url = `${wsScheme}//${wsHost}/ws/detection/webcam/?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('open');
      // Send the model config
      ws.send(JSON.stringify({ type: 'config', model_id: selectedModelId }));
    };

    ws.onerror = () => {
      setWsStatus('error');
      setWsError('WebSocket connection failed.');
    };

    ws.onclose = () => {
      setWsStatus('closed');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // FPS counter (incoming messages)
      fpsCounterRef.current.in += 1;
      const now = Date.now();
      if (now - fpsCounterRef.current.lastIn >= 1000) {
        setFpsIn(fpsCounterRef.current.in);
        fpsCounterRef.current.in = 0;
        fpsCounterRef.current.lastIn = now;
      }

      if (msg.type === 'configured') {
        setActiveModel(msg.model);
        setIsStreaming(true);
        runningRef.current = true;
        // Start the capture loop
        lastSentAtRef.current = 0;
        captureLoop();
      } else if (msg.type === 'boxes') {
        lastBoxesRef.current = msg.boxes;
        setLatestBoxes(msg.boxes);
        setObjectCount(msg.object_count);
        setInferenceMs(msg.inference_time_ms);
      } else if (msg.type === 'error') {
        setWsError(msg.message);
      } else if (msg.type === 'stopped') {
        setIsStreaming(false);
      }
    };
  }, [stream, selectedModelId]);

  const stopStreaming = useCallback(() => {
    runningRef.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    setIsStreaming(false);
    lastBoxesRef.current = [];
  }, []);

  // ── Capture loop: send frames + draw boxes ──────────────────────────
  const captureLoop = useCallback(() => {
    const video = videoRef.current;
    const overlay = canvasRef.current;
    const capture = captureCanvasRef.current;
    if (!video || !overlay || !capture || !runningRef.current) {
      animationRef.current = null;
      return;
    }

    const W = video.videoWidth;
    const H = video.videoHeight;

    if (W && H) {
      if (overlay.width !== W || overlay.height !== H) {
        overlay.width = W;
        overlay.height = H;
      }
      if (capture.width !== W || capture.height !== H) {
        capture.width = W;
        capture.height = H;
      }

      // Draw latest boxes on overlay
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      const boxes = lastBoxesRef.current;
      if (boxes && boxes.length) {
        const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
        const classColor = (cls) => {
          let hash = 0;
          for (let i = 0; i < cls.length; i++) hash = (hash * 31 + cls.charCodeAt(i)) | 0;
          return palette[Math.abs(hash) % palette.length];
        };
        for (const box of boxes) {
          const x = box.x1;
          const y = box.y1;
          const w = box.x2 - box.x1;
          const h = box.y2 - box.y1;
          const color = classColor(box.class_name);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
          const label = `${box.class_name} ${(box.confidence * 100).toFixed(0)}%`;
          ctx.font = 'bold 18px sans-serif';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = color;
          ctx.fillRect(x, Math.max(0, y - 26), tw + 12, 26);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, x + 6, Math.max(20, y - 7));
        }
      }

      // Throttle: send a frame every WS_FRAME_SEND_INTERVAL_MS
      const now = performance.now();
      if (now - lastSentAtRef.current >= WS_FRAME_SEND_INTERVAL_MS) {
        if (wsRef.current && wsRef.current.readyState === 1) {
          // Draw current video frame into capture canvas, then encode
          const cctx = capture.getContext('2d');
          cctx.drawImage(video, 0, 0, W, H);
          capture.toBlob(
            (blob) => {
              if (blob && wsRef.current && wsRef.current.readyState === 1) {
                blob.arrayBuffer().then((buf) => {
                  if (wsRef.current && wsRef.current.readyState === 1) {
                    wsRef.current.send(buf);
                    // FPS counter (outgoing frames)
                    fpsCounterRef.current.out += 1;
                    const t2 = Date.now();
                    if (t2 - fpsCounterRef.current.lastOut >= 1000) {
                      setFpsOut(fpsCounterRef.current.out);
                      fpsCounterRef.current.out = 0;
                      fpsCounterRef.current.lastOut = t2;
                    }
                  }
                });
              }
            },
            'image/jpeg',
            0.7
          );
          lastSentAtRef.current = now;
        }
      }
    }

    animationRef.current = requestAnimationFrame(captureLoop);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Camera size={24} className="text-emerald-500" />
          Webcam Detection (Live)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Live camera stream with bounding boxes drawn in real time via WebSocket.
        </p>
      </div>

      {/* Controls bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
        {!stream ? (
          <button
            onClick={startCamera}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
          >
            <Camera size={16} />
            Start Camera
          </button>
        ) : (
          <button
            onClick={stopCamera}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-red-500 hover:bg-red-600 shadow-sm transition-all"
          >
            <CameraOff size={16} />
            Stop Camera
          </button>
        )}

        {stream && (
          isStreaming ? (
            <button
              onClick={stopStreaming}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-amber-500 hover:bg-amber-600 shadow-sm transition-all"
            >
              <CameraOff size={16} />
              Stop Detection
            </button>
          ) : (
            <button
              onClick={startStreaming}
              disabled={!selectedModelId || wsStatus === 'connecting'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium shadow-sm transition-all ${
                !selectedModelId || wsStatus === 'connecting'
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {wsStatus === 'connecting' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Camera size={16} />
                  Start Detection
                </>
              )}
            </button>
          )
        )}

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Model</label>
          {modelsLoading ? (
            <div className="w-full bg-slate-50 border border-slate-300 text-slate-400 text-sm rounded-lg p-2">
              Loading...
            </div>
          ) : (
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={isStreaming}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 disabled:opacity-50"
            >
              <option value="">-- Select model --</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} v{m.version}{' '}
                  <span className="text-slate-400">[{m.category}]</span>
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          {stream && (
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Camera live
            </span>
          )}
          {wsStatus === 'open' && (
            <span className="flex items-center gap-1 text-emerald-600">
              <Wifi size={13} /> WS live
            </span>
          )}
          {wsStatus === 'connecting' && (
            <span className="flex items-center gap-1 text-amber-600">
              <Wifi size={13} /> Connecting...
            </span>
          )}
          {(wsStatus === 'closed' || wsStatus === 'idle') && (
            <span className="flex items-center gap-1 text-slate-400">
              <WifiOff size={13} /> Idle
            </span>
          )}
          {wsStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-500">
              <WifiOff size={13} /> Error
            </span>
          )}
        </div>
      </div>

      {/* Errors */}
      {cameraError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {cameraError}
        </div>
      )}
      {wsError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {wsError}
        </div>
      )}

      {/* Live view + detection stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Big live preview with overlay */}
        <div className="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="relative bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center min-h-[420px]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[640px] w-auto"
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ objectFit: 'contain' }}
            />
            <canvas ref={captureCanvasRef} className="hidden" />
            {!stream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
                <Camera size={48} className="mb-3 opacity-50" />
                <p>Start the camera to see the live feed</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats panel */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <h2 className="text-base font-semibold text-slate-800 border-b pb-2">
            Detection Stats
          </h2>

          {activeModel ? (
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-sm">
              <p className="text-emerald-900 font-semibold">
                {activeModel.name} v{activeModel.version}
              </p>
              <p className="text-emerald-700 text-xs uppercase mt-0.5">
                [{activeModel.category}]
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No model active.</p>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-xs text-slate-500">Objects</p>
              <p className="text-2xl font-bold text-slate-900">{objectCount}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-xs text-slate-500">Inference</p>
              <p className="text-2xl font-bold text-slate-900">
                {inferenceMs > 0 ? inferenceMs.toFixed(0) : '—'}
                <span className="text-sm font-normal text-slate-400 ml-1">ms</span>
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-xs text-slate-500">Frames in</p>
              <p className="text-2xl font-bold text-slate-900">{fpsIn}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-xs text-slate-500">Frames out</p>
              <p className="text-2xl font-bold text-slate-900">{fpsOut}</p>
            </div>
          </div>

          {latestBoxes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">
                Last detections
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {latestBoxes.map((b, i) => (
                  <span
                    key={i}
                    className="text-xs bg-blue-50 border border-blue-100 text-blue-800 px-2 py-0.5 rounded-full"
                  >
                    {b.class_name} {(b.confidence * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t text-xs text-slate-500 space-y-1">
            <p>• Camera → server via WebSocket (binary JPEG)</p>
            <p>• Server runs YOLO, sends boxes back</p>
            <p>• Browser draws boxes on the live feed</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebcamDetectionPage;
