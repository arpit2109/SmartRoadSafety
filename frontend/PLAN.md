# Frontend Build Plan — All API Routes Wired

## Context

The Django backend exposes three API groups. Auth and AI Model APIs are partially wired.
Manual Detection and the axios/JWT layer are already in place. This plan covers every
remaining page and route.

---

## Page Inventory

| Route | Component | Auth | Priority |
|---|---|---|---|
| `/profile` | `ProfilePage.jsx` | authenticated | High |
| `/models` | `ModelManagementPage.jsx` | admin only | High |
| `/models/upload` | `ModelUploadPage.jsx` | admin only | High |

---

## Shared Abstractions

### `src/services/api.js` — already done
- Axios singleton with JWT request interceptor + silent 401→refresh retry

### `src/context/AuthContext.jsx` — already done
- `user`, `login`, `logout`, `register`, `fetchUserProfile`, `isAuthenticated`

### `src/components/ProtectedRoute.jsx` — already done
- Redirects unauthenticated users to `/login`
- Full-page spinner while `isLoading`

---

## Page 1 — Profile `/profile`

**URL:** `GET|PATCH /api/auth/profile/`

### What it does
- Fetches profile on mount (`GET /api/auth/profile/`)
- Editable fields: first name, last name, profile picture
- Inline change-password form (`POST /api/auth/change-password/`)
- Save button submits PATCH on blur/click

### UI Layout (single column, max-w-2xl)
```
┌─ Profile ───────────────────────────────────┐
│  Avatar (circle, initials fallback if no photo)
│  Username (read-only, from AuthContext)
│  Email (read-only)
│  ────────────────────────────────────────────
│  First Name        Last Name
│  [_____________]  [_____________]
│  Profile Picture [Upload]
│  ────────────────────────────────────────────
│  [ Save Changes ]
│  ────────────────────────────────────────────
│  Change Password (collapsible section)
│    Old Password   [_____________]
│    New Password   [_____________]
│    Confirm        [_____________]
│    [ Update Password ]
└──────────────────────────────────────────────┘
```

### Form state
- `form: { firstname, lastname, profile_picture }`
- `passwords: { old_password, new_password, confirm_password }`
- `saving: bool`, `passwordSaving: bool`
- `errors: { field: message }`

### API calls
- `api.get('/api/auth/profile/')` — load
- `api.patch('/api/auth/profile/', formData)` — save (multipart because of avatar)
- `api.post('/api/auth/change-password/', passwords)` — change password

### Files changed
- `src/pages/ProfilePage.jsx` (new)
- `src/App.jsx` — add route (protected)
- `src/components/Layout.jsx` — add nav link

---

## Page 2 — Model Management `/models`

**URLs used:**
- `GET /api/ai/models/` — list (with query params: `?category=`, `?is_active=`)
- `GET /api/ai/models/<id>/` — retrieve
- `DELETE /api/ai/models/<id>/` — soft-delete
- `POST /api/ai/models/<id>/activate/` — activate
- `POST /api/ai/models/<id>/deactivate/` — deactivate
- `POST /api/ai/models/<id>/set-default/` — set default
- `GET /api/ai/models/categories/` — filter options

### What it does
- Paginated table of all AIModels
- Columns: Name, Version, Category, Status badge, Default badge, Accuracy, Uploaded by, Date, Actions
- Category filter dropdown (from `/categories/`)
- Active/Inactive toggle filter
- Row actions: Activate / Deactivate / Set Default / Delete (soft)
- Navigate to detail or upload page
- Empty state with CTA to upload

### Status badges
- `is_active=True` → green "Active" badge
- `is_active=False` → red "Inactive" badge
- `is_default=True` → blue "Default" badge

### Row action buttons
- Activate: appears only if `is_active=False`
- Deactivate: appears only if `is_active=True`
- Set Default: appears only if `is_default=False && is_active=True`
- Delete: always visible, confirms with a window.confirm dialog

### Optimistic UI
- On action click → disable button → call API → on success update row in state → on error show toast

### Files changed
- `src/pages/ModelManagementPage.jsx` (new)
- `src/App.jsx` — add route (admin only)
- `src/components/Layout.jsx` — add nav link (admin only)

---

## Page 3 — Model Upload `/models/upload`

**URL:** `POST /api/ai/models/upload/` (multipart/form-data)

### What it does
- Drag-and-drop file upload zone for `.pt` / `.onnx` / `.engine` files
- Fields: name, category (dropdown), version, description, imgsz, classes (JSON textarea), default_confidence (slider), default_iou (slider), accuracy (optional), is_default (checkbox)
- Submit as `multipart/form-data` with the weight file as a field
- On success → redirect to `/models`
- On error → field-level error messages

### Form fields
| Field | Type | Default | Notes |
|---|---|---|---|
| `weight_file` | file input | required | accept .pt/.onnx/.engine |
| `name` | text | required | |
| `category` | select | required | helmet/vehicle/bike/custom |
| `version` | text | required | e.g. "1.0" |
| `description` | textarea | "" | optional |
| `imgsz` | number | 640 | |
| `classes` | textarea | [] | JSON array, e.g. ["helmet","no_helmet"] |
| `default_confidence` | range slider 0–1 | 0.25 | show decimal value |
| `default_iou` | range slider 0–1 | 0.45 | show decimal value |
| `accuracy` | number 0–1 | null | optional |
| `is_default` | checkbox | false | |

### Files changed
- `src/pages/ModelUploadPage.jsx` (new)
- `src/App.jsx` — add route (admin only)

---

## Routing Changes

### `src/App.jsx`

```jsx
// New imports
import ProfilePage from './pages/ProfilePage';
import ModelManagementPage from './pages/ModelManagementPage';
import ModelUploadPage from './pages/ModelUploadPage';

// Routes to add (inside the ProtectedRoute wrapper):
<Route path="profile" element={<ProfilePage />} />
<Route path="models" element={<ModelManagementPage />} />
<Route path="models/upload" element={<ModelUploadPage />} />
```

### Admin guards
- `ModelManagementPage` and `ModelUploadPage` should check `user.is_staff`.
- If non-admin hits them → show "Admin access required" message.
- Alternatively, `App.jsx` route guards can check `is_staff` before rendering.

---

## Layout Changes

### `src/components/Layout.jsx`

Add nav items conditionally based on auth:
- Always visible: Dashboard, Manual Detection
- Authenticated: Profile
- Admin (`user.is_staff`): Model Management, Upload Model

---

## Toast / Notification System

No toast library is installed. Use a simple in-component state approach:
- `toast: { message, type: 'success'|'error'|'info' }`
- Renders a fixed bottom-right banner, auto-dismisses after 3s
- Reusable `useToast()` hook in `src/hooks/useToast.js`

---

## Files to Create

```
src/pages/ProfilePage.jsx
src/pages/ModelManagementPage.jsx
src/pages/ModelUploadPage.jsx
src/hooks/useToast.js
```

---

## Files to Modify

```
src/App.jsx          — add 3 routes
src/components/Layout.jsx — add nav items
```

---

## Verification

1. `npm run build` in `/frontend` → zero errors
2. Register a new user → can log in → Dashboard loads
3. Register as admin (is_staff=True in DB or via admin) → Model Management and Upload nav items appear
4. Non-admin → sees nav items as disabled or hidden
5. Upload a `.pt` file → redirects to model list → new model appears
6. Activate/deactivate model → status badge updates without page reload
7. Profile edit → name saves → shown in Layout sidebar

---

## Execution Order

1. `useToast.js` hook (small, used everywhere)
2. `ProfilePage.jsx`
3. `Layout.jsx` nav updates
4. `ModelManagementPage.jsx`
5. `ModelUploadPage.jsx`
6. `App.jsx` route additions
7. `npm run build` verification
