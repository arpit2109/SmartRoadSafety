import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ManualDetection from './pages/ManualDetection';
import AutoDetectionPage from './pages/AutoDetectionPage';
import VideoDetectionPage from './pages/VideoDetectionPage';
import WebcamDetectionPage from './pages/WebcamDetectionPage';
import ProfilePage from './pages/ProfilePage';
import ModelManagementPage from './pages/ModelManagementPage';
import ModelUploadPage from './pages/ModelUploadPage';

const App = () => (
  <Router>
    <Routes>
      {/* Public — landing page is Auto Detection (no auth) */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/detect/auto" element={<AutoDetectionPage />} />
      <Route path="/" element={<AutoDetectionPage />} />

      {/* Protected — wrapped in Layout, guarded by auth */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="detect/manual" element={<ManualDetection />} />
        <Route path="detect/video" element={<VideoDetectionPage />} />
        <Route path="detect/webcam" element={<WebcamDetectionPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="models" element={<ModelManagementPage />} />
        <Route path="models/upload" element={<ModelUploadPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Login />} />
    </Routes>
  </Router>
);

export default App;
