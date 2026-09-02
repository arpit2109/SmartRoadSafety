/**
 * ModelUploadPage — /models/upload
 *
 * POST /api/ai/models/upload/  (multipart/form-data)
 * Redirects to /models on success.
 */
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileBox, X, ArrowLeft, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../hooks/useToast';

const CATEGORIES = [
  { value: 'helmet', label: 'Helmet Detection' },
  { value: 'vehicle', label: 'Vehicle Detection' },
  { value: 'bike', label: 'Bike Detection' },
  { value: 'custom', label: 'Custom' },
];

const INITIAL_FORM = {
  name: '',
  category: 'helmet',
  version: '1.0',
  description: '',
  imgsz: 640,
  classes: '[]',
  default_confidence: 0.25,
  default_iou: 0.45,
  accuracy: '',
  is_default: false,
};

const ModelUploadPage = () => {
  const { user } = useAuth();
  const { toast, dismiss, toasts } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL_FORM);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

  if (user?.is_staff !== true) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  const validateFile = (f) => {
    if (!f) return 'Please select a weight file.';
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['pt', 'onnx', 'engine'].includes(ext)) {
      return 'Only .pt, .onnx, and .engine files are supported.';
    }
    return '';
  };

  const acceptFile = (f) => {
    const err = validateFile(f);
    setFileError(err);
    if (!err) setFile(f);
  };

  const handleFileChange = (e) => acceptFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  const removeFile = () => {
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -------------------------------------------------------------------------
  // Form fields
  // -------------------------------------------------------------------------

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const setNum = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }));

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setFileError('A weight file is required.'); return; }

    // Validate classes JSON
    let classes;
    try {
      classes = JSON.parse(form.classes || '[]');
      if (!Array.isArray(classes)) throw new Error();
    } catch {
      setErrors((prev) => ({ ...prev, classes: 'Must be a valid JSON array, e.g. ["helmet","bike"]' }));
      return;
    }

    // Validate accuracy
    const accuracy = form.accuracy !== '' ? parseFloat(form.accuracy) : null;
    if (form.accuracy !== '' && (isNaN(accuracy) || accuracy < 0 || accuracy > 1)) {
      setErrors((prev) => ({ ...prev, accuracy: 'Must be a number between 0 and 1.' }));
      return;
    }

    setErrors({});
    setSubmitting(true);

    const payload = new FormData();
    payload.append('name', form.name);
    payload.append('category', form.category);
    payload.append('version', form.version);
    payload.append('weight_file', file);
    payload.append('description', form.description);
    payload.append('imgsz', String(form.imgsz));
    payload.append('classes', JSON.stringify(classes));
    payload.append('default_confidence', String(form.default_confidence));
    payload.append('default_iou', String(form.default_iou));
    if (accuracy !== null) payload.append('accuracy', String(accuracy));
    payload.append('is_default', String(form.is_default));

    try {
      await api.post('/api/ai/models/upload/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast('Model uploaded successfully!', 'success');
      setTimeout(() => navigate('/models'), 1200);
    } catch (err) {
      if (err.response?.data && typeof err.response.data === 'object') {
        const fieldErrors = {};
        for (const [key, msgs] of Object.entries(err.response.data)) {
          fieldErrors[key] = Array.isArray(msgs) ? msgs[0] : msgs;
        }
        setErrors(fieldErrors);
        if (fieldErrors.non_field_errors) {
          toast(fieldErrors.non_field_errors, 'error');
        }
      } else {
        toast('Upload failed. Check the file and try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/models')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Upload AI Model</h1>
          <p className="text-sm text-slate-500 mt-0.5">Register a new YOLO or ONNX weight file.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* File drop zone */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Weight File *</h2>

          {file ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileBox size={22} className="text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-800 truncate">{file.name}</p>
                  <p className="text-xs text-blue-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="shrink-0 p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : fileError
                  ? 'border-red-300 bg-red-50'
                  : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <Upload size={28} className={`mx-auto mb-2 ${dragging ? 'text-blue-500' : 'text-slate-400'}`} />
              <p className="text-sm font-medium text-slate-600">
                <span className="text-blue-600">Click to upload</span> or drag & drop
              </p>
              <p className="text-xs text-slate-400 mt-1">.pt · .onnx · .engine</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pt,.onnx,.engine"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {fileError && <p className="mt-2 text-xs text-red-500">{fileError}</p>}
        </div>

        {/* Model metadata */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Model Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *" name="name" value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Helmet Detection" />
            <Field label="Version *" name="version" value={form.version} onChange={set('version')} error={errors.version} placeholder="e.g. 1.0" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Category *" value={form.category} onChange={set('category')} error={errors.category} options={CATEGORIES} />
            <Field label="Image Size" name="imgsz" type="number" value={form.imgsz} onChange={setNum('imgsz')} error={errors.imgsz} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
            <textarea
              name="description"
              rows={3}
              value={form.description}
              onChange={set('description')}
              placeholder="Optional description of the model…"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Classes
              <span className="ml-2 text-xs text-slate-400 font-normal">JSON array, e.g. ["helmet","bike"]</span>
            </label>
            <textarea
              name="classes"
              rows={2}
              value={form.classes}
              onChange={set('classes')}
              placeholder='["class1", "class2"]'
              className={`w-full px-3 py-2.5 border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${errors.classes ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
            />
            {errors.classes && <p className="mt-1 text-xs text-red-500">{errors.classes}</p>}
          </div>
        </div>

        {/* Inference settings */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Inference Defaults</h2>

          <div className="grid grid-cols-2 gap-4">
            <SliderField
              label="Confidence Threshold"
              name="default_confidence"
              value={form.default_confidence}
              min={0}
              max={1}
              step={0.05}
              onChange={setNum('default_confidence')}
              display={(form.default_confidence * 100).toFixed(0) + '%'}
            />
            <SliderField
              label="IoU Threshold"
              name="default_iou"
              value={form.default_iou}
              min={0}
              max={1}
              step={0.05}
              onChange={setNum('default_iou')}
              display={(form.default_iou * 100).toFixed(0) + '%'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Reported Accuracy (mAP)"
              name="accuracy"
              type="number"
              step="0.001"
              min="0"
              max="1"
              value={form.accuracy}
              onChange={set('accuracy')}
              placeholder="e.g. 0.771 (optional)"
              error={errors.accuracy}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={set('is_default')}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Set as default model for this category</span>
          </label>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/models')}
            className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium shadow-sm transition-all ${
              submitting
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
            }`}
          >
            {submitting ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                Upload Model
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

const Field = ({ label, name, type = 'text', value, onChange, error, placeholder = '' }) => (
  <div>
    {label && <label htmlFor={name} className="block text-sm font-medium text-slate-600 mb-1">{label}</label>}
    <input
      id={name}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
    />
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const SelectField = ({ label, value, onChange, error, options }) => (
  <div>
    {label && <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>}
    <select
      value={value}
      onChange={onChange}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const SliderField = ({ label, name, value, min, max, step, onChange, display }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label htmlFor={name} className="text-sm font-medium text-slate-600">{label}</label>
      <span className="text-sm font-mono text-slate-700">{display}</span>
    </div>
    <input
      id={name}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className="w-full accent-blue-600"
    />
  </div>
);

// Icon used in submit button
const RefreshCw = ({ size, className }) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export default ModelUploadPage;
