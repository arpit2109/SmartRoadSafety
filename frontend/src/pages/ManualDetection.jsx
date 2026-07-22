import React, { useState } from 'react';
import axios from 'axios';

const ManualDetection = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [category, setCategory] = useState('vehicle');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResult(null);
    }
  };

  const handleDetect = async () => {
    if (!file) return;
    
    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('category', category);

    try {
      // Update with your actual API endpoint URL when running
      const response = await axios.post('http://localhost:8000/api/detection/image/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setResult(response.data);
    } catch (error) {
      console.error("Detection failed:", error);
      alert("Detection failed. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Manual Detection</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Upload Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">Upload Source</h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">AI Model Category</label>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            >
              <option value="vehicle">Vehicle Detection</option>
              <option value="helmet">Helmet Detection</option>
              <option value="bike">Bike Detection</option>
            </select>
          </div>

          <div>
             <label className="block text-sm font-medium text-slate-700 mb-2">Upload Image</label>
             <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-slate-500">SVG, PNG, JPG or GIF (MAX. 800x400px)</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
             </div> 
          </div>

          <button
            onClick={handleDetect}
            disabled={!file || loading}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium shadow-sm transition-all ${
              !file || loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
            }`}
          >
            {loading ? 'Processing...' : 'Run Detection'}
          </button>
        </div>

        {/* Preview / Results Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">Results</h2>
          
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
          
          {result && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h3 className="font-semibold text-blue-900">Detection Summary</h3>
              <p className="text-blue-800 mt-1">Objects Detected: <strong>{result.object_count}</strong></p>
              {result.detections?.length > 0 && (
                <div className="mt-2 text-sm text-blue-800 max-h-32 overflow-y-auto">
                  <ul className="list-disc pl-5">
                    {result.detections.map((det, i) => (
                      <li key={i}>{det.class_name} ({(det.confidence * 100).toFixed(1)}%)</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualDetection;
