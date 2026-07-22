import React from 'react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stat Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Total Detections</h3>
          <p className="text-3xl font-bold text-slate-900 mt-2">1,234</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Active Models</h3>
          <p className="text-3xl font-bold text-slate-900 mt-2">4</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Avg. Confidence</h3>
          <p className="text-3xl font-bold text-slate-900 mt-2">87.5%</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
        <h2 className="text-xl font-semibold text-slate-800">Ready to run a new detection?</h2>
        <p className="text-slate-500 max-w-md">
          Upload an image or video, and our AI models will automatically detect vehicles, helmets, and other road safety features.
        </p>
        <Link 
          to="/detect/manual" 
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 hover:shadow-md transition-all"
        >
          Start Manual Detection
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
