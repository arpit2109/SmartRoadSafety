/**
 * ProfilePage — /profile
 *
 * GET  /api/auth/profile/  → { firstname, lastname, profile_picture }
 * PATCH /api/auth/profile/ → update (multipart for avatar)
 * POST /api/auth/change-password/ → { old_password, new_password }
 */
import React, { useEffect, useState } from 'react';
import { User, Lock, Camera, Save } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../hooks/useToast';

const ProfilePage = () => {
  const { user, fetchUserProfile } = useAuth();
  const { toast, dismiss, toasts } = useToast();

  // Profile fields
  const [form, setForm] = useState({ firstname: '', lastname: '', profile_picture: null });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});

  // Password fields
  const [pw, setPw] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwSaving, setPwSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // Load profile
  useEffect(() => {
    api.get('/api/auth/profile/').then(({ data }) => {
      setForm((prev) => ({
        ...prev,
        firstname: data.firstname || '',
        lastname: data.lastname || '',
      }));
      if (data.profile_picture) {
        setAvatarPreview(data.profile_picture);
      }
    }).catch(() => {
      toast('Failed to load profile.', 'error');
    });
  }, []);

  const handleProfileChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'profile_picture' && files[0]) {
      setForm((prev) => ({ ...prev, profile_picture: files[0] }));
      setAvatarPreview(URL.createObjectURL(files[0]));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    setProfileErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileErrors({});
    setSaving(true);

    const payload = new FormData();
    payload.append('firstname', form.firstname);
    payload.append('lastname', form.lastname);
    if (form.profile_picture) {
      payload.append('profile_picture', form.profile_picture);
    }

    try {
      const { data } = await api.patch('/api/auth/profile/', payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // Update AuthContext with new profile
      fetchUserProfile();
      setAvatarPreview(data.profile_picture || avatarPreview);
      toast('Profile saved!', 'success');
    } catch (err) {
      if (err.response?.data && typeof err.response.data === 'object') {
        setProfileErrors(err.response.data);
      } else {
        toast('Failed to save profile.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePwChange = (e) => {
    const { name, value } = e.target;
    setPw((prev) => ({ ...prev, [name]: value }));
    setPwErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validatePw = () => {
    const errs = {};
    if (!pw.old_password) errs.old_password = 'Current password is required.';
    if (!pw.new_password) errs.new_password = 'New password is required.';
    else if (pw.new_password.length < 8) errs.new_password = 'At least 8 characters.';
    if (pw.new_password !== pw.confirm_password) errs.confirm_password = 'Passwords do not match.';
    return errs;
  };

  const handlePwSubmit = async (e) => {
    e.preventDefault();
    const errs = validatePw();
    if (Object.keys(errs).length) { setPwErrors(errs); return; }

    setPwSaving(true);
    try {
      await api.post('/api/auth/change-password/', {
        old_password: pw.old_password,
        new_password: pw.new_password,
      });
      setPw({ old_password: '', new_password: '', confirm_password: '' });
      setPasswordOpen(false);
      toast('Password updated!', 'success');
    } catch (err) {
      if (err.response?.data?.old_password) {
        setPwErrors({ old_password: err.response.data.old_password[0] });
      } else {
        toast('Failed to change password.', 'error');
      }
    } finally {
      setPwSaving(false);
    }
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Profile</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your account details and password.
        </p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Avatar + username header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6 flex items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover border-4 border-white/40"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center text-2xl font-bold text-white">
                {initials}
              </div>
            )}
            <label className="absolute bottom-0 right-0 w-7 h-7 bg-blue-700 border-2 border-white rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-800 transition-colors">
              <Camera size={12} className="text-white" />
              <input
                type="file"
                name="profile_picture"
                accept="image/*"
                className="hidden"
                onChange={handleProfileChange}
              />
            </label>
          </div>

          {/* User info */}
          <div>
            <p className="text-lg font-semibold text-white">{user?.username}</p>
            <p className="text-sm text-blue-100">{user?.email}</p>
            <p className="text-xs text-blue-200 mt-0.5">
              Joined {user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleProfileSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="First Name"
              name="firstname"
              value={form.firstname}
              onChange={handleProfileChange}
              error={profileErrors.firstname}
              placeholder="Your first name"
            />
            <Field
              label="Last Name"
              name="lastname"
              value={form.lastname}
              onChange={handleProfileChange}
              error={profileErrors.lastname}
              placeholder="Your last name"
            />
          </div>

          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Username</label>
              <input
                type="text"
                value={user?.username || ''}
                readOnly
                disabled
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                readOnly
                disabled
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-all ${
              saving
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
            }`}
          >
            <Save size={15} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Change password card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setPasswordOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Lock size={18} className="text-slate-400" />
            <span className="font-medium text-slate-700">Change Password</span>
          </div>
          <span className="text-slate-400 text-lg">{passwordOpen ? '−' : '+'}</span>
        </button>

        {passwordOpen && (
          <form onSubmit={handlePwSubmit} className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
            <Field
              label="Current Password"
              name="old_password"
              type="password"
              value={pw.old_password}
              onChange={handlePwChange}
              error={pwErrors.old_password}
              placeholder="Enter current password"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="New Password"
                name="new_password"
                type="password"
                value={pw.new_password}
                onChange={handlePwChange}
                error={pwErrors.new_password}
                placeholder="Min. 8 characters"
              />
              <Field
                label="Confirm New Password"
                name="confirm_password"
                type="password"
                value={pw.confirm_password}
                onChange={handlePwChange}
                error={pwErrors.confirm_password}
                placeholder="Repeat new password"
              />
            </div>
            <button
              type="submit"
              disabled={pwSaving}
              className={`px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-all ${
                pwSaving
                  ? 'bg-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'
              }`}
            >
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reusable field component
// ---------------------------------------------------------------------------

const Field = ({ label, name, type = 'text', value, onChange, error, placeholder = '' }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium text-slate-600 mb-1">
      {label}
    </label>
    <input
      id={name}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
        error ? 'border-red-400 bg-red-50' : 'border-slate-300'
      }`}
    />
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

export default ProfilePage;
