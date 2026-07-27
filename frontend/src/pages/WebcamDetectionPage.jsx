import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';

/**
 * WebcamDetectionPage
 *
 * Captures frames from the browser camera and runs detection on each frame.
 * No server round-trip per frame — detection runs against the live feed.
 *
 * Note: actual model inference requires the model to be loaded in the browser.
 * This page sends frames to /api/detection/image/ for now (client → server → back).
 */
const WebcamDetectionPage = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [processingFrame, setProcessingFrame] = useState(false);
  const [fps, setFps] = useState(0);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Frame counters for FPS display
  const frameCountRef = useRef(0);
  const lastFpsTime = useRef(Date.now());

  // Fetch models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await api.get('/api/ai/models/dropdown/');
        setModels(res.data);
        if (res.data.length > 0) {
          setSelectedModelId(res.data[0].id);
        }
      } catch {
        // silently fail — user can still use camera without models
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraError('');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permissions in your browser.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setIsRunning(false);
    setResult(null);
  }, [stream]);

  // Process a single frame through the backend
  const processFrame = useCallback(
    async (blob) => {
      if (!selectedModelId) return;
      setProcessingFrame(true);
      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');
      formData.append('model_id', selectedModelId);
      try {
        const res = await api.post(
          '/api/detection/image/',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setResult(res.data);
      } catch {
        // silently ignore per-frame errors to keep the stream smooth
      } finally {
        setProcessingFrame(false);
      }
    },
    [selectedModelId]
  );

  // Capture loop — samples every 30 frames (~1 fps to avoid server overload)
  const startCaptureLoop = useCallback(() => {
    setIsRunning(true);
    setResult(null);

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0);

      frameCountRef.current += 1;
      const now = Date.now();
      if (now - lastFpsTime.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTime.current = now;
      }

      // Only send to backend every 30 frames (~1 fps)
      if (frameCountRef.current % 30 === 0 && !processingFrame) {
        canvas.toBlob(
          (blob) => {
            if (blob) processFrame(blob);
          },
          'image/jpeg',
          0.7
        );
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
  }, [processFrame, processingFrame]);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Camera size={24} className="text-emerald-500" />
          Webcam Detection
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Use your camera for real-time detection. Point and see live results.
        </p>
      </div>

      {/* Camera / model setup */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Camera controls */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Camera
          </h2>

          {!stream ? (
            <button
              onClick={startCamera}
              className="w-full py-3 px-4 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <Camera size={16} />
              Start Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="w-full py-3 px-4 rounded-lg text-white font-medium bg-red-500 hover:bg-red-600 shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <CameraOff size={16} />
              Stop Camera
            </button>
          )}

          {cameraError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {cameraError}
            </div>
          )}

          {/* Hidden video + canvas for capture */}
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full rounded-lg border border-slate-200 ${
                !stream ? 'hidden' : ''
              }`}
            />
            {stream && (
              <canvas ref={canvasRef} className="hidden" />
            )}
          </div>

          {stream && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
              <span>{fps} fps (capture: ~1 fps)</span>
            </div>
          )}
        </div>

        {/* Model + results */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">
            Detection
          </h2>

          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              AI Model
            </label>
            {modelsLoading ? (
              <div className="w-full bg-slate-50 border border-slate-300 text-slate-400 text-sm rounded-lg p-2.5">
                Loading...
              </div>
            ) : (
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
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

          {/* Start / stop detection */}
          {stream && (
            <div className="flex gap-3">
              {!isRunning ? (
                <button
                  onClick={startCaptureLoop}
                  disabled={!selectedModelId}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-white font-medium shadow-sm transition-all flex items-center justify-center gap-2 ${
                    !selectedModelId
                      ? 'bg-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <RefreshCw size={15} />
                  Start Detection
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (animationRef.current) {
                      cancelAnimationFrame(animationRef.current);
                      animationRef.current = null;
                    }
                    setIsRunning(false);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg text-white font-medium bg-red-500 hover:bg-red-600 shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <CameraOff size={15} />
                  Stop Detection
                </button>
              )}
            </div>
          )}

          {/* Latest result */}
          {result && (
            <div className="space-y-3">
              {/* Annotated frame */}
              <div className="bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center min-h-[300px]">
                {result.annotated_image_base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${result.annotated_image_base64}`}
                    alt="Latest detection"
                    className="max-h-[360px] w-auto object-contain"
                  />
                ) : (
                  <span className="text-slate-400">No annotated frame</span>
                )}
              </div>

              {/* Stats bar */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-2">
                {result.model && (
                  <span>
                    <strong>{result.model.name}</strong> v{result.model.version}
                  </span>
                )}
                <span>Objects: <strong>{result.object_count}</strong></span>
                <span>Time: <strong>{result.processing_time}s</strong></span>
                {processingFrame && (
                  <span className="text-amber-600 italic">Processing...</span>
                )}
              </div>

              {/* Detections list */}
              {result.detections?.length > 0 && (
                <div className="text-sm text-slate-700">
                  <p className="font-medium mb-1">Detected:</p>
                  <div className="flex flex-wrap gap-2">
                    {result.detections.map((d, i) => (
                      <span
                        key={i}
                        className="bg-blue-50 border border-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs"
                      >
                        {d.class_name} ({(d.confidence * 100).toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!stream && !result && (
            <div className="flex items-center justify-center min-h-[200px]">
              <p className="text-slate-400 text-sm">
                Start the camera to begin live detection.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebcamDetectionPage;
