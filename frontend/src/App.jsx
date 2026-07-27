import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ManualDetection from './pages/ManualDetection';
import ProfilePage from './pages/ProfilePage';
import ModelManagementPage from './pages/ModelManagementPage';
import ModelUploadPage from './pages/ModelUploadPage';

const App = () => (
  <Router>
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected — wrapped in Layout, guarded by auth */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="detect/manual" element={<ManualDetection />} />
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
