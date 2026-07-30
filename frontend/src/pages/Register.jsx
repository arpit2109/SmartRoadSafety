import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const { register, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    contact_no: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: '' }));
    setApiError('');
  };

  const validate = () => {
    const errs = {};

    if (!form.username.trim()) {
      errs.username = 'Username is required.';
    } else if (form.username.length < 3) {
      errs.username = 'Username must be at least 3 characters.';
    }

    if (!form.email.trim()) {
      errs.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Enter a valid email address.';
    }

    if (!form.contact_no.trim()) {
      errs.contact_no = 'Contact number is required.';
    } else if (!/^\d{10}$/.test(form.contact_no)) {
      errs.contact_no = 'Must be exactly 10 digits.';
    } else if (!/^[6789]/.test(form.contact_no)) {
      errs.contact_no = 'Must start with 6, 7, 8 or 9.';
    }

    if (!form.password) {
      errs.password = 'Password is required.';
    } else if (form.password.length < 8) {
      errs.password = 'Password must be at least 8 characters.';
    }

    if (form.password !== form.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    setApiError('');

    try {
      // Register the account
      await register({
        username: form.username,
        email: form.email,
        contact_no: form.contact_no,
        password: form.password,
      });

      // Auto-login after successful registration
      await login(form.username, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // Field-level errors from DRF serializer (e.g. contact_no validation)
      if (err.response?.data && typeof err.response.data === 'object') {
        const fieldErrors = {};
        for (const [key, msgs] of Object.entries(err.response.data)) {
          if (Array.isArray(msgs)) {
            fieldErrors[key] = msgs[0];
          } else {
            fieldErrors[key] = msgs;
          }
        }
        if (Object.keys(fieldErrors).length) {
          setErrors(fieldErrors);
          return;
        }
      }
      setApiError(
        err.response?.data?.detail ||
        err.message ||
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const field = (name, label, type = 'text', placeholder = '') => (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-slate-700 mb-1"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={type === 'password' ? 'new-password' : undefined}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full px-3 py-3 border rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${
          errors[name] ? 'border-red-400 bg-red-50' : 'border-slate-300'
        }`}
      />
      {errors[name] && (
        <p className="mt-1 text-xs text-red-500">{errors[name]}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6 bg-white p-10 rounded-2xl shadow-sm border border-slate-200">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-900">Create an Account</h2>
          <p className="mt-2 text-sm text-slate-500">
            Join SmartRoadSafety today
          </p>
        </div>

        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {apiError}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {field('username', 'Username', 'text', 'Choose a username')}
          {field('email', 'Email Address', 'email', 'you@example.com')}
          {field('contact_no', 'Contact Number', 'text', '10-digit mobile number')}
          {field('password', 'Password', 'password', 'Min. 8 characters')}
          {field('confirmPassword', 'Confirm Password', 'password', 'Re-enter your password')}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg text-white font-semibold text-sm shadow-sm transition-all ${
              loading
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'
            }`}
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
