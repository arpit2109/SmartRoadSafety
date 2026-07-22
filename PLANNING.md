# SmartRoadSafety — Project Planning Document

> **Project:** Smart Road Safety Detection System
> **Generated:** 2026-07-22
> **Stack:** Django 6 + DRF + JWT + React 19 + Vite + Tailwind CSS + YOLOv8 + OpenCV

---

## System Architecture Overview

```
frontend/ (React 19 + Vite + Tailwind)
  ├── pages/       — Login, Register, Dashboard, ManualDetection, Profile, etc.
  ├── components/  — Layout, Navbar, UploadCard, Alert, Loader
  └── context/     — AuthContext (JWT state)

backend/ (Django 6 + DRF)
  ├── accounts/   — CustomUser, Profile, JWT auth APIs
  ├── ai/         — AIModel DB, loader, cache, detector, model_selector
  └── detection/   — DetectionService, DetectionRecord (history)
```

---

## Status Legend
- ✅ **Done** — shipped and verified
- 🟡 **Partial** — started, some work remaining
- 🔴 **Not started**

---

# Module 1 — Project Initialization

## What It Covers

Establishes the Django + React project scaffold with all dependencies pre-configured. The Django project (`smartroadsafety/`) owns settings, URL routing, and WSGI/ASGI entry points. The React app (`frontend/`) is bootstrapped with Vite for fast HMR. Tailwind CSS is wired for utility-first styling. All environment variables are centralized.

## Why It Matters

Starting with a clean, repeatable setup means every developer on the project can `git clone && pip install && npm install && python manage.py runserver` and have a working system in under 5 minutes. No "works on my machine" surprises.

## Tasks

1. ✅ Create Django project via `django-admin startproject smartroadsafety backend/`
2. ✅ Install Django REST Framework (`djangorestframework`) and add to `INSTALLED_APPS`
3. ✅ Install `djangorestframework-simplejwt` for JWT authentication
4. ✅ Install `django-cors-headers` and configure CORS to allow the React dev server (localhost:5173)
5. ✅ Configure `MEDIA_URL = /media/` and `MEDIA_ROOT` pointing to `backend/media/`
6. ✅ Create `accounts/`, `ai/`, `detection/` Django apps under `backend/`
7. ✅ Register all three apps in `INSTALLED_APPS`
8. ✅ Create `backend/media/uploads/` and `backend/media/results/` directories
9. ✅ Create `backend/media/models/{helmet,vehicle,bike,custom}/` for AIModel weight files
10. ✅ Initialize React app under `frontend/` using Vite (`npm create vite`)
11. ✅ Install and configure Tailwind CSS v4 with `@tailwindcss/vite` plugin
12. ✅ Install `axios` for HTTP requests from React to Django
13. ✅ Install and configure `react-router-dom` v7 for client-side routing
14. ✅ Configure `vite.config.js` with a proxy for `/api` → `http://localhost:8000`
15. ✅ Create `backend/.env` with `SECRET_KEY`, `DEBUG=True`, `ALLOWED_HOSTS=localhost,127.0.0.1`
16. ✅ Create `frontend/.env` with `VITE_API_URL=http://localhost:8000`
17. ✅ Install `python-dotenv` in backend; load `.env` in `settings.py`
18. ✅ Create `.gitignore` covering `venv/`, `__pycache__/`, `*.pyc`, `db.sqlite3`, `.env`, `media/results/`, `media/uploads/`
19. ✅ Add `frontend/node_modules/` to `.gitignore`
20. ✅ Pin all Python deps in `requirements.txt` (Django==6.0.7, djangorestframework==3.17.1, etc.)
21. ✅ Pin all frontend deps in `frontend/package.json` (no `*` versions in production deps)
22. ✅ Create `README.md` with step-by-step setup: Python venv, pip install, npm install, run commands
23. ✅ Create `Procfile` stub (`web: gunicorn smartroadsafety.wsgi`) for future deployment
24. 🟡 Verify `npm run build` in frontend produces a clean production build with no errors
25. 🟡 Run `python manage.py check` with no warnings on a fresh `db.sqlite3`

---

# Module 2 — Authentication & User Management

## What It Covers

Builds the complete authentication layer: a custom Django user model (`CustomUser`) with email and contact number, a `Profile` model for extended user data, JWT access + refresh tokens via SimpleJWT, token blacklisting for logout, and a full set of REST APIs for registration, login, logout, token refresh, and profile viewing/updating. The Django admin is customized to make user management effortless.

## Why It Matters

Every object in the system — uploaded files, AI models, detection records — belongs to a user. Authentication is the gatekeeper. Getting this right means every future feature (Module 4–13) is naturally multi-tenant, secure, and auditable.

## Tasks

1. ✅ Define `CustomUserManager` in `accounts/managers.py` with `create_user()` and `create_superuser()`
2. ✅ Define `CustomUser` model in `accounts/models.py` — extends `AbstractUser`, adds `email` (unique) and `contact_no` (10-digit, Indian mobile validation)
3. ✅ Set `AUTH_USER_MODEL = "accounts.CustomUser"` in `settings.py`
4. ✅ Define `Profile` model — `OneToOneField` to `CustomUser`, fields: `firstname`, `lastname`, `profile_picture` (ImageField)
5. ✅ Wire `post_save` signal in `accounts/signals.py` to auto-create a `Profile` on new user creation
6. ✅ Register both models in `accounts/admin.py` with full `CustomUserAdmin` (list_display, search, filter, fieldsets, actions)
7. ✅ Create `UserRegisterInputSerializer` — validates username, email, contact_no (regex 10-digit Indian), password (min 8 chars + Django validators)
8. ✅ Create `UserOutputSerializer` — returns id, username, email, contact_no, date_joined (read-only)
9. ✅ Create `ProfileInputSerializer` — accepts firstname, lastname, profile_picture
10. ✅ Create `ProfileOutputSerializer` — returns id, firstname, lastname, profile_picture (absolute URL)
11. ✅ Implement `RegisterView` — `POST /api/auth/register/`, creates user + profile, returns UserOutputSerializer
12. ✅ Configure SimpleJWT in `settings.py` — access token lifetime 30 days, refresh token lifetime 30 days, blacklist enabled
13. ✅ Wire SimpleJWT views: `TokenObtainPairView` at `login/`, `TokenRefreshView` at `token/refresh/`
14. ✅ Implement `ProfileView` — `GET` returns profile (auto-creates if missing), `PATCH` updates it
15. ✅ Add `POST /api/auth/logout/` endpoint — accepts `refresh` token, adds it to SimpleJWT blacklist
16. ✅ Add `POST /api/auth/change-password/` — validates old password, saves new hashed password
17. ✅ Add `IsAuthenticated` permission on all auth endpoints except login/register
18. ✅ Run `makemigrations accounts` and `migrate` — verify schema is clean
19. ✅ Write tests: register (valid/invalid data), login (correct/wrong password), logout (blacklist check), profile read/patch
20. ✅ Verify admin: create a superuser, log in, see CustomUser list with contact_no, email, is_staff, is_active columns
21. ✅ Add admin actions "Activate selected users" and "Deactivate selected users" in CustomUserAdmin
22. ✅ Add `first_name` / `last_name` display in the user admin list using `list_select_related`
23. ✅ Create a seed script `python manage.py shell` snippet or management command to create a dev superuser non-interactively

---

# Module 3 — AI Model Management System

## What It Covers

Transforms the system from hardcoded YOLO loading to a dynamic model registry. Every trained YOLO model is registered as a database row in the `AIModel` table. The system stores the weight file on disk, metadata in the DB, and exposes a REST API and Django admin for full CRUD. A process-local in-memory cache avoids re-loading weights on every request. All business logic lives in a service layer, keeping views thin.

## Why It Matters

This is the architectural backbone of the entire platform. Without this, every new AI model requires a code change. With it, adding a new model is an admin operation — no developer involvement needed.

## Tasks

1. 🟡 Define `AIModel` model in `ai/models.py`:
   - `Category` TextChoices: `helmet`, `vehicle`, `bike`, `custom`
   - `WeightFormat` TextChoices: `pt`, `onnx`, `engine`
   - Fields: `name`, `category`, `version`, `weight_file` (FileField → `models/<category>/...`), `weight_format`, `default_confidence`, `default_iou`, `accuracy` (nullable), `is_active`, `is_default`, `uploaded_by` (FK), `created_at`, `updated_at`
   - Unique constraint on `(name, version, category)`
   - Indexes on `(category, is_active)` and `is_default`
2. 🟡 **Add new fields:** `description` CharField(500), `imgsz` PositiveIntegerField(default=640), `classes` JSONField(default=list) — store class names like `["driver_with_helmet", "bike", ...]`
3. 🟡 Run `makemigrations ai` and `migrate` for all new fields
4. ✅ Implement `ai/utils.py` — `validate_weight_extension()`, `validate_confidence/iou/accuracy()`, `resolve_model_path()`, `delete_weight_file()`, `get_default_model()`, `get_active_model_by_name()`
5. ✅ Implement `ai/cache.py` — `ModelCache` class: `get()`, `set()`, `invalidate()`, `clear()`, `stats()`. Thread-safe via `threading.Lock`. Module-level singleton `cache`.
6. ✅ Implement `ai/model_loader.py`:
   - `load_model(name, category=None)` → returns cached or freshly-loaded YOLO instance
   - `load_default(category=None)` → returns the active default model
   - `warm_cache()` → pre-loads all active models at startup
   - Custom errors: `ModelNotFound`, `NoDefaultModel`, `ModelFileMissing`, `ModelLoadError`
   - Lazy import of `ultralytics.YOLO` inside `_build_framework_instance()`
7. ✅ Implement `ai/services.py`:
   - `create_model(...)` — validates, saves file + row in atomic transaction
   - `set_as_default()` — unsets siblings atomically via `transaction.atomic`
   - `activate()` / `deactivate()` — toggles state, invalidates cache
   - `replace_weight_file()` — swaps file, cleans old one, invalidates cache
   - `hard_delete()` — removes row and file
   - `bulk_activate()` / `bulk_deactivate()` / `bulk_set_default()` for admin actions
8. ✅ Implement `ai/serializers.py`:
   - `AIModelListSerializer` — slim fields for list view
   - `AIModelDetailSerializer` — all fields + `weight_file_url` (absolute) + `file_size_bytes`
   - `AIModelUploadSerializer` — write serializer for multipart upload
   - `AIModelUpdateSerializer` — PATCH serializer for mutable fields
   - `CategoryStatSerializer` — for the categories endpoint
9. ✅ Implement `ai/views.py` — `AIModelViewSet` with: list/retrieve, create (multipart), partial_update, destroy (soft), activate/deactivate/set-default custom actions, categories endpoint, cache-stats endpoint
10. ✅ Wire `ai/urls.py` with `DefaultRouter`
11. ✅ Implement `ai/admin.py` — full `AIModelAdmin`: list_display, list_filter, search, fieldsets, readonly_fields, admin actions (activate/deactivate/make_default)
12. ✅ Implement `ai/signals.py` — `post_save` and `post_delete` receivers to invalidate cache on weight file change, is_active change, or row deletion
13. ✅ Create `ai/apps.py` with `ready()` that imports signals
14. ✅ Create `python manage.py register_model` management command for CLI model registration
15. ✅ Update `register_model` command to accept `--classes` JSON argument
16. 🟡 Write `test_models.py` — AIModel creation, unique constraint violation, defaults, string representation
17. 🟡 Write `test_services.py` — `set_as_default` unsets sibling, `deactivate` clears cache, `replace_weight_file` removes old file
18. 🟡 Write `test_cache.py` — concurrent get/set under ThreadPoolExecutor (5 threads, 10 ops each), hit/miss/load counters
19. 🟡 Write `test_api.py` — full CRUD via `APIClient`, anonymous=401, regular user=403 on upload, admin=201; multipart upload with dummy `.pt` in `tests/fixtures/`
20. 🟡 Write `test_loader.py` — monkey-patch `YOLO` constructor, verify second call hits cache
21. 🟡 Run `python manage.py test ai` — fix any failures
22. 🟡 Verify the admin shows all new fields (description, imgsz, classes); update serializers to include them

---

# Module 4 — Detection Engine

## What It Covers

Builds the core inference pipeline. The `YOLODetector` class wraps a loaded YOLO instance and exposes a single `run_inference()` method that accepts a NumPy image array, runs prediction, and returns structured results. Annotated images (with bounding boxes drawn on) are saved to `media/results/`. The detection API endpoint lives in the `ai` app and delegates to the service layer.

## Why It Matters

Module 3 manages model metadata. Module 4 actually runs the AI. Everything downstream (manual detection, auto detection, video, webcam) builds on this. Getting the result structure right here means every consumer gets consistent, typed data without re-parsing.

## Tasks

1. 🔴 Implement `ai/model_selector.py`:
   - `select_best_model(category)` — queries `AIModel.objects.filter(category, is_active=True, is_default=True).first()`; raises `NoDefaultModel` if none
   - `select_model_by_id(id)` — queries by primary key
   - `select_auto(image_np)` — rule-based scene detection → category → model (Module 7 stub)
2. 🔴 Implement `ai/detector.py`:
   - `YOLODetector.__init__(self, ai_model)` — calls `load_model()` to get the cached YOLO instance; stores `ai_model` metadata
   - `run_inference(self, image_np, conf=None, iou=None)` — calls `self.model.predict()`, processes results
   - `draw_boxes(self, image_np, boxes, scores, class_names)` — returns annotated copy with OpenCV rectangles + labels
3. 🔴 Structure the result dict returned by `run_inference()`:
   ```python
   {
     "boxes": [[x1, y1, x2, y2], ...],       # absolute pixel coords
     "scores": [0.92, 0.87, ...],            # float 0-1
     "class_names": ["driver_with_helmet", ...],
     "class_ids": [0, 2, ...],                # int class indices
     "count": 3,
     "inference_time_ms": 41.2,
     "annotated_image": <numpy array>           # returned for immediate encoding
   }
   ```
4. 🔴 Implement annotated image saving in `detector.py` — `save_annotated(image_np, output_path)` → saves JPEG to `media/results/`
5. 🔴 Create `POST /api/models/detect/image/` in `ai/views.py`:
   - Accept `image` (multipart), optional `model_id` (int) or `category` (str), optional `conf` and `iou` overrides
   - Validate image type (JPEG, PNG) and max size (20 MB)
   - Look up model via `model_selector`
   - Run detection via `YOLODetector`
   - Save annotated image to `media/results/`
   - Return: annotated image URL, boxes, scores, class_names, count, inference_time_ms
   - Require `IsAuthenticated`
6. 🔴 Wire `/api/models/detect/image/` into `ai/urls.py`
7. 🔴 Update `detection/services.py` — import and delegate to `ai.detector.YOLODetector` and `ai.model_selector`
8. 🔴 Implement error handling:
   - `NoDefaultModel` → 404 with message
   - `ModelFileMissing` → 500 with "weight file not found"
   - `ModelLoadError` → 500 with wrapped message
   - Invalid image → 400 with validation error
9. 🔴 Add `POST /api/models/detect/image/batch/` — accepts multiple images, returns array of results (for future batch processing)
10. 🔴 Add `GET /api/models/detect/preview/` — accepts a single image, returns annotated image as JPEG response (for quick preview without saving to disk)
11. 🔴 Implement confidence/IoU threshold validation in the API — reject values outside 0.0–1.0
12. 🔴 Write `test_detector.py` — mock YOLO `.predict()` result, verify result dict structure, verify annotated image is a numpy array of same shape as input
13. 🔴 Write `test_model_selector.py` — verify it picks active default, raises on inactive model, raises on unknown category
14. 🔴 Add `GET /api/models/<id>/metadata/` — returns just the AIModel fields (name, version, classes, accuracy, default_confidence, default_iou) without the weight file URL — lightweight info for the frontend
15. 🔴 Add `conf_threshold` and `iou_threshold` as optional query params on the detect endpoint
16. 🔴 Add logging: log model loaded, inference time, object count at INFO level
17. 🟡 Benchmark: run detection on 5 test images of varying sizes; log WARNING if inference > 2000ms
18. 🟡 Add `imgsz` parameter to `run_inference()` — pass through to `model.predict(imgsz=...)` using the AIModel's `imgsz` field as default
19. 🟡 Create `tests/fixtures/sample_road.jpg` — a small test image for benchmarks and smoke tests

---

# Module 5 — Frontend Foundation

## What It Covers

Completes the React shell by wiring up real JWT authentication, an `AuthContext` that manages token lifecycle, protected routes that redirect unauthenticated users, and an `api.js` axios singleton with interceptors for automatic token attachment and 401→refresh retry. The decorative pages from Module 1 are replaced with functional ones that call real backend APIs.

## Why It Matters

The frontend currently looks good but does nothing — every form is decorative. Without this module, there's no way for users to actually log in, manage their account, or interact with the detection system. This transforms the UI into a working application.

## Tasks

1. 🔴 Create `src/utils/api.js`:
   - Axios instance with `baseURL: import.meta.env.VITE_API_URL`
   - Request interceptor: attach `Authorization: Bearer <access_token>` from localStorage
   - Response interceptor: on 401, attempt token refresh via `POST /api/auth/token/refresh/`
   - If refresh succeeds, retry original request with new token
   - If refresh fails, clear tokens and redirect to `/login`
2. 🔴 Create `src/context/AuthContext.jsx`:
   - `user` state (null | user object)
   - `isAuthenticated` computed
   - `login(username, password)` — POST to login endpoint, store tokens, fetch user profile, set user state
   - `logout()` — POST to logout endpoint, clear localStorage, reset state
   - `register(username, email, contact_no, password)` — POST to register endpoint
   - `updateUser(userData)` — PATCH profile, update local state
3. 🔴 Create `src/components/ProtectedRoute.jsx`:
   - Reads `isAuthenticated` from AuthContext
   - If false, redirects to `/login?next=<current path>`
   - Wraps all protected routes in `App.jsx`
4. 🔴 Update `src/App.jsx`:
   - Wrap protected routes in `<ProtectedRoute>`
   - Add `/profile`, `/history`, `/analytics`, `/reports` routes (placeholder components for now)
5. 🔴 Wire `src/pages/Login.jsx`:
   - Replace `<Link to="/">` with `login()` call
   - Show loading spinner while awaiting response
   - Show error alert on failure (wrong credentials, network error)
   - Redirect to `/` (or `?next=`) on success
6. 🔴 Wire `src/pages/Register.jsx`:
   - Replace form action with `register()` call
   - Validate password min length client-side before submit
   - Redirect to `/login` on success with a "Account created" toast
7. 🔴 Create `src/pages/Profile.jsx`:
   - Fetch `GET /api/auth/profile/` on mount
   - Display/edit form: firstname, lastname, profile_picture (with preview)
   - Save via `PATCH /api/auth/profile/`
   - Show success/error alerts
8. 🔴 Create `src/components/Navbar.jsx`:
   - Show "SmartRoadSafety" logo + current page title
   - Show user avatar initial (from token or profile) top-right
   - Show logout button
9. 🔴 Update `src/components/Layout.jsx`:
   - Replace hardcoded `<header>` with `<Navbar />`
   - Update sidebar links to match all routes
10. 🔴 Create `src/components/Loader.jsx` — full-screen semi-transparent spinner overlay
11. 🔴 Create `src/components/Alert.jsx` — dismissible banner: success (green), error (red), warning (yellow), info (blue)
12. 🔴 Add `Alert` to all form submissions (login, register, profile save) — show errors from API
13. 🔴 Add `Loader` to all async operations — show while fetching profile, logging in, etc.
14. 🔴 Update `src/pages/Dashboard.jsx`:
    - Replace hardcoded "1,234" stats with real API calls (will use history endpoint once Module 10 exists; for now call `/api/models/` for active model count and show placeholder for detections)
    - Show loading skeleton while fetching
15. 🔴 Create `src/components/UploadCard.jsx` — reusable drag-and-drop file upload zone:
    - Shows preview of selected image
    - Shows file name and size
    - Has "Remove" button
    - Handles `onChange` callback
16. 🔴 Create `src/components/BoundingBoxOverlay.jsx` — SVG overlay component that renders bounding boxes on top of an image given a list of `{x1, y1, x2, y2, label, score}`
17. 🔴 Add `vite-env.d.ts` for TypeScript support (even if using JSX for now) — declare `import.meta.env.VITE_API_URL`
18. 🔴 Set up `eslint` rules: disable unused-vars for production, enforce `no-console` in favor of logger
19. 🟡 Add `src/utils/formatters.js` — helper functions: `formatDate(date)`, `formatFileSize(bytes)`, `formatConfidence(0.87)` → "87.0%"
20. 🟡 Add a global "toast" notification system (lightweight, no extra lib) for success/error messages

---

# Module 6 — Manual Detection (Frontend)

## What It Covers

Replaces the decorative `ManualDetection.jsx` with a fully functional page that lets users select an AI model, upload an image or video, tune confidence/IoU sliders, run detection, and view/download results. The page calls real APIs and renders bounding boxes using the SVG overlay component.

## Why It Matters

This is the first user-facing feature that does something visible. The quality of this page — responsiveness, clarity of results, ease of use — sets the tone for the whole application.

## Tasks

1. 🔴 Replace hardcoded `<select>` with dynamic model list:
   - On mount, fetch `GET /api/models/?is_active=true`
   - Show model name + version + category in dropdown
   - Group by category (Helmet Models, Vehicle Models, etc.)
2. 🔴 Replace `POST /api/detection/image/` with `POST /api/models/detect/image/`
3. 🔴 Add confidence threshold slider:
   - Range 0.0–1.0, step 0.05
   - Default from selected model's `default_confidence`
   - Shows current value as label
   - Sends as `conf` param in request
4. 🔴 Add IoU threshold slider:
   - Range 0.0–1.0, step 0.05
   - Default from selected model's `default_iou`
   - Sends as `iou` param in request
5. 🔴 Show model info card above the upload area:
   - Model name, version, category badge
   - Accuracy field from AIModel (or "N/A")
   - Class names list from AIModel `classes` field
6. 🔴 Use `UploadCard` component for image upload; add drag-and-drop support
7. 🔴 Add a separate tab/section for video upload (same endpoint, `video` field)
8. 🔴 On detection complete:
   - Display annotated image using `<BoundingBoxOverlay />` on top of original image
   - Show detection results table: Class, Confidence %, Bounding Box (x1,y1,x2,y2)
   - Color-code rows by class (alternate colors)
9. 🔴 Add "Download Result" button — fetches the annotated image URL and triggers browser download
10. 🔴 Add "Copy to Clipboard" button — copies a plain-text summary of detections
11. 🔴 Show processing time (ms) and object count in the results card
12. 🔴 Show a "No objects detected" message when count is 0
13. 🔴 Add confidence filter: hide detections below a threshold from the overlay and table
14. 🔴 Add image zoom/pan on hover over the annotated result
15. 🔴 Show detection history card at bottom — "View all detections" link to Module 10
16. 🟡 For video uploads: show a progress bar with "Processing frame X of Y..."
17. 🟡 Add a "Toggle Labels" checkbox — show/hide class name labels on the bounding boxes
18. 🟡 Add "Toggle Scores" — show/hide confidence percentages on the boxes
19. 🟡 Implement image zoom via mouse wheel on the result image
20. 🟡 Add a "Quick preset" dropdown for common confidence values: Low (0.25), Medium (0.5), High (0.75)

---

# Module 7 — Automatic Model Selection

## What It Covers

Implements intelligent, automatic model selection so users don't need to understand AI models. A scene-analysis step runs a quick detection pass on the uploaded image to determine what category is present, then routes to the best matching model. The user simply uploads an image and the system decides.

## Why It Matters

Manual model selection works but requires users to know which model to pick. Automatic selection makes the system accessible to non-technical users and future-proofs against new model categories.

## Tasks

1. 🔴 Design scene-to-category mapping in `ai/model_selector.py`:
   ```python
   SCENE_RULES = {
       "helmet": ["bike", "motorcycle", "helmet", "rider"],
       "vehicle": ["car", "truck", "bus", "van", "motor_vehicle"],
       "bike": ["bicycle", "bike"],
       "custom": [],  # custom is always manual
   }
   ```
2. 🔴 Implement `detect_scene(image_np, confidence=0.1)` in `model_selector.py`:
   - Loads the most generic available model (or YOLOv8n as fallback)
   - Runs detection at very low confidence to find any objects
   - Returns the set of class names detected
3. 🔴 Implement `classify_scene(class_names)`:
   - Iterates `SCENE_RULES`; for each scene, checks if any detected class matches any rule keyword (substring match)
   - Returns the first matching scene category, or `"custom"` as fallback
4. 🔴 Implement `select_auto(image_np)`:
   - Calls `detect_scene()` → `classify_scene()` → `select_best_model(category)`
   - Returns the loaded YOLO model instance
5. 🔴 Create `POST /api/models/detect/auto/` endpoint:
   - Same request shape as `/detect/image/` but no `model_id`/`category` required
   - Internally calls `select_auto()`
   - Returns: same structure as `/detect/image/` + `selected_category` field
6. 🔴 Wire `/detect/auto/` into `ai/urls.py`
7. 🔴 Frontend: create `src/pages/AutoDetection.jsx`:
   - One-click "Auto Detect" — no model dropdown
   - Shows spinner with "Analyzing scene..."
   - After detection, shows the auto-selected category as a badge
   - Results displayed same as Manual Detection
8. 🔴 Frontend: show a "Scene detected: [category]" badge on the results card
9. 🔴 Add "Automatic" option to the detection navigation (sidebar link)
10. 🔴 Write `test_auto_selector.py`:
    - Mock scene detection → verify correct category returned
    - Mock empty scene → verify fallback to "custom" or helpful error
    - Verify `select_auto` raises `NoDefaultModel` when no model is registered
11. 🟡 Add scene rule logging: log which rule matched and with which class names
12. 🟡 Design future: add a lightweight `scene-classifier` model (e.g. ResNet-18 trained on scene images) to replace substring matching
13. 🟡 Store `SCENE_RULES` in Django settings as a configurable dict — allow admins to tweak rules via admin without code changes
14. 🟡 Add a "Show scene analysis" toggle in AutoDetection — reveals which objects were found during scene detection and why the category was chosen

---

# Module 8 — Video Detection

## What It Covers

Extends the detection pipeline to process video files. The system reads each frame with OpenCV, runs YOLO detection on it, draws bounding boxes, and reassembles the frames into a new video file. Users get a processed video they can download.

## Why It Matters

Still images are limited. Road safety monitoring requires video — traffic violations happen over time, not in a single frame.

## Tasks

1. 🔴 Create `POST /api/models/detect/video/` endpoint:
   - Accept `video` (multipart, mp4/avi/mov), optional `model_id`/`category`, optional `conf`/`iou`
   - Validate video type and max size (500 MB)
2. 🔴 Implement video processing in `ai/detector.py`:
   - `process_video(input_path, output_path, detector, conf, iou)` → generator yielding `(frame_idx, total_frames, detections)` for progress tracking
3. 🔴 Use OpenCV `VideoCapture` to read frames one-by-one
4. 🔴 Run `YOLODetector.run_inference()` on each frame
5. 🔴 Draw bounding boxes on each processed frame (matching the image annotation style)
6. 🔴 Use OpenCV `VideoWriter` to write processed frames to output file (H.264 mp4, same FPS as input)
7. 🔴 Save processed video to `media/results/videos/<uuid>.mp4`
8. 🔴 Return JSON response:
   ```json
   {
     "video_url": "/media/results/videos/abc123.mp4",
     "total_frames": 300,
     "processed_frames": 300,
     "total_objects_detected": 1240,
     "objects_per_frame": [4, 5, 3, ...],
     "inference_time_seconds": 45.2,
     "fps": 28.5
   }
   ```
9. 🔴 Implement progress tracking:
   - Use a job ID approach: return `job_id` immediately, process in background (Celery task or thread)
   - For MVP, process synchronously but stream progress via chunked response or polling
10. 🔴 Frontend: create `src/pages/VideoDetection.jsx`:
    - Upload video drag-and-drop area
    - Show progress bar: "Processing frame 47 / 300..."
    - On completion: show video player with processed video
    - Download button
11. 🔴 Frontend: add "Processing speed" indicator — frames processed per second
12. 🔴 Frontend: show per-frame detection summary — expandable list of objects per frame
13. 🔴 Add audio passthrough — copy original audio track into processed video (using `ffmpeg-python` or `moviepy`)
14. 🔴 Handle video rotation/metadata: use `ffprobe` to detect rotation and apply correction before processing
15. 🔴 Write `test_video_detection.py`:
    - Create a 1-second synthetic video (or use a tiny test mp4)
    - Verify output video exists and has same duration
    - Verify at least one frame has detected objects
16. 🟡 Add a "Download frames as ZIP" option — export annotated frames as individual JPEG images
17. 🟡 Implement frame skipping: process every Nth frame for very long videos (>5 min) to save time, interpolate results
18. 🟡 Add watermark to processed video: "Processed by SmartRoadSafety" in bottom-right corner
19. 🟡 Support GPU acceleration via CUDA if available (check `torch.cuda.is_available()` and use GPU device in YOLO)
20. 🟡 Add "Cancel processing" button — kills the background thread/worker

---

# Module 9 — Live Webcam Detection

## What It Covers

Provides real-time object detection through the browser's webcam. The frontend captures frames, sends them to the backend API, and overlays detection results on the live video feed. Users can take snapshots, record clips, and see live detection alerts.

## Why It Matters

For enforcement officers at road checkpoints, a live feed with instant helmet/no-helmet detection is far more practical than uploading files afterward.

## Tasks

1. 🔴 Frontend: create `src/pages/WebcamDetection.jsx`
2. 🔴 Request camera access: `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`
3. 🔴 Render live video feed in a `<video>` element
4. 🔴 Implement frame capture loop using `requestAnimationFrame`:
   - Capture a frame every N ms (default 500ms, configurable)
   - Convert canvas to Blob → `FormData` → POST to `/api/models/detect/image/`
5. 🔴 Render detection results as SVG overlay on top of video:
   - `<svg>` with `<rect>` for each bounding box
   - `<text>` label below each box with class name + confidence
   - Color-code by class
6. 🔴 Show FPS counter — "X fps" updated every second
7. 🔴 Add "Snapshot" button:
   - Captures current frame + current overlay
   - Saves to detection history via `POST /api/history/` (Module 10)
8. 🔴 Add "Start/Stop Recording" button:
   - Uses `MediaRecorder` API to record the live stream
   - Exports as `.webm` file download
9. 🔴 Add confidence threshold slider — filters which detections are shown on the overlay
10. 🔴 Add "Alert Mode" toggle:
    - When `driver_without_helmet` is detected with confidence > 0.5, show a red flashing banner
    - Play a short audio alert beep (generated via Web Audio API, no external file)
11. 🔴 Backend: ensure `/api/models/detect/image/` responds in <200ms for webcam use:
    - Add `@throttle` class to the endpoint (allow high frequency from the same user)
    - Ensure model is already warm in cache
12. 🔴 Add "Camera selector" — if device has multiple cameras, let user switch front/back
13. 🔴 Add "Detection overlay opacity" slider — adjust how visible the bounding box overlay is
14. 🔴 Implement basic object tracking between frames:
    - Use centroid distance + IoU to match detections across frames
    - Assign consistent IDs to tracked objects (reduces box flickering)
15. 🔴 Frontend: show "Live Detection" vs "Paused" indicator
16. 🟡 Add a "Detection trail" — draw a fading path showing where each tracked object has moved over the last 3 seconds
17. 🟡 Add "Speed estimation" — if two cameras are spaced known distance apart, estimate vehicle speed from frame-to-frame centroid movement
18. 🟡 Implement "Night mode" — boost brightness of low-light webcam feed using CSS `filter: brightness(1.3) contrast(1.1)`
19. 🟡 Add "Save recording with alerts" option — include alert timestamps in the exported metadata JSON file alongside the video
20. 🟡 Handle camera disconnection gracefully — show "Camera disconnected" overlay, attempt reconnect

---

# Module 10 — Detection History

## What It Covers

Creates a `DetectionRecord` model that stores every detection result permanently, linked to the user who requested it. Provides a full CRUD API for history management and a React page for browsing past detections with search, filters, and pagination.

## Why It Matters

Users need to review what they've detected. Enforcement teams need an audit trail. The history also powers the analytics dashboard (Module 11) and report generation (Module 12).

## Tasks

1. 🔴 Create `DetectionRecord` model in `detection/models.py`:
   ```
   user              → ForeignKey(CustomUser)
   uploaded_file     → FileField(upload_to="history/uploads/")
   result_file       → FileField(upload_to="history/results/", null=True)
   ai_model          → ForeignKey(AIModel)
   detection_mode    → CharField(max_length=20: "manual" | "auto" | "webcam")
   confidence_used   → FloatField
   iou_used          → FloatField
   detections       → JSONField  # list of {class_name, confidence, x1, y1, x2, y2}
   object_count      → PositiveIntegerField
   inference_time_ms → FloatField
   created_at        → DateTimeField(auto_now_add=True)
   ```
2. 🔴 Add unique constraint: `(user, uploaded_file, created_at)` — prevents duplicate uploads
3. 🔴 Create index on `(user, created_at)` for fast history queries
4. 🔴 Run `makemigrations detection` and `migrate`
5. 🔴 Register `DetectionRecord` in `detection/admin.py` with list_display: user, ai_model, detection_mode, object_count, created_at
6. 🔴 Wire `DetectionService.process_image()` to save a `DetectionRecord` after each detection
7. 🔴 Create `GET /api/history/` endpoint:
   - List records for `request.user`
   - Filter by `mode` (query param), `ai_model` (query param), `date_from`/`date_to`
   - Paginate: 20 per page, `?page=1`
   - Return: id, uploaded_file url, result_file url, ai_model name, detection_mode, object_count, created_at
8. 🔴 Create `GET /api/history/<id>/` — full detail including the full `detections` JSON
9. 🔴 Create `DELETE /api/history/<id>/` — hard delete record + files
10. 🔴 Create `PATCH /api/history/<id>/` — allow updating `detections` JSON (e.g. to correct mislabeled data)
11. 🔴 Create `GET /api/history/<id>/download/` — return the result_file as a file download
12. 🔴 Create `POST /api/history/` — manually create a record (used by webcam snapshots)
13. 🔴 Frontend: create `src/pages/History.jsx`:
    - Table: thumbnail (uploaded image), date, model name, mode badge, object count, actions
    - Pagination controls: "Previous / Next" buttons
14. 🔴 Frontend: add filter panel:
    - Date range picker (from/to)
    - Detection mode dropdown (All / Manual / Auto / Webcam)
    - Model name search
15. 🔴 Frontend: row actions:
    - "View" — opens a modal with annotated image + detection table
    - "Download" — downloads result file
    - "Delete" — with confirmation dialog
16. 🔴 Frontend: "Select multiple" checkbox per row + "Delete selected" bulk action
17. 🔴 Frontend: add a search bar — filters by model name or class name in detections
18. 🔴 Add "Export selected" — downloads selected records as a ZIP of images + JSON metadata
19. 🟡 Add "Re-run detection" button — re-sends the original uploaded file through the detector with current models
20. 🟡 Add "Share" button — generates a temporary public link for a detection record (signed URL with expiry)

---

# Module 11 — Dashboard & Analytics

## What It Covers

Builds the analytics layer on top of the detection history. Aggregates data into meaningful statistics and renders them as interactive charts. The dashboard shows trends over time, model usage patterns, and per-user activity.

## Why It Matters

Raw detection records are overwhelming. The dashboard makes patterns visible at a glance — which models are most used, when violations spike, how detection accuracy varies by model.

## Tasks

1. 🔴 Create `GET /api/analytics/stats/` endpoint:
   ```json
   {
     "total_detections": 4821,
     "detections_today": 34,
     "detections_this_week": 287,
     "detections_this_month": 1204,
     "most_used_model": {"id": 3, "name": "Helmet Detector", "count": 2341},
     "avg_confidence": 0.812,
     "avg_inference_time_ms": 43.7,
     "total_users": 28,
     "total_models": 5
   }
   ```
2. 🔴 Create `GET /api/analytics/timeline/` endpoint:
   - Returns array of `{date: "2026-07-20", count: 47}` for last 30 days
   - Supports `?days=7|30|90` query param
3. 🔴 Create `GET /api/analytics/model-usage/` endpoint:
   - Returns array of `{model_name, category, count}` sorted by count descending
4. 🔴 Create `GET /api/analytics/category-distribution/` endpoint:
   - Returns `{class_name, count}` aggregated from all detections JSON across all records
5. 🔴 Create `GET /api/analytics/hourly/` endpoint:
   - Returns `{hour: 0-23, count}` — peak hours analysis for enforcement planning
6. 🔴 Create `GET /api/analytics/user-activity/` endpoint:
   - Returns `{user_id, username, detection_count, last_seen}` for admin dashboard
7. 🔴 Frontend: install `recharts` (`npm install recharts`)
8. 🔴 Frontend: upgrade `src/pages/Dashboard.jsx`:
    - Replace hardcoded stats cards with real data from `/api/analytics/stats/`
    - Show loading skeletons while fetching
    - Show "No data yet" state when API returns 0
9. 🔴 Frontend: add Detection Timeline chart:
    - `LineChart` from recharts — X: date, Y: count
    - Tooltip showing exact count on hover
    - Responsive container
10. 🔴 Frontend: add Model Usage chart:
    - `BarChart` — X: model name, Y: detection count
    - Color-coded bars by category
11. 🔴 Frontend: add Category Distribution chart:
    - `PieChart` / `DoughnutChart` — class_name vs count
    - Legend with counts and percentages
12. 🔴 Frontend: add Hourly Activity chart:
    - `BarChart` — X: hour (0-23), Y: detections
    - Highlights peak hours in a different color
13. 🔴 Frontend: add "Recent Activity" feed:
    - Last 10 detection records from `/api/history/?page=1`
    - Shows thumbnail, model name, time ago ("2 minutes ago")
14. 🔴 Frontend: add date range selector (Last 7 days / 30 days / 90 days / Custom) — re-fetches all chart data on change
15. 🔴 Frontend: add "Quick Stats" row: today's detections, active models, avg confidence, avg inference time
16. 🔴 Backend: add "Violation Rate" stat — percentage of detections where `class_name` contains "without_helmet" or similar violation classes
17. 🔴 Frontend: add "Violation Rate" metric card in red/green
18. 🔴 Backend: cache analytics responses in Redis (or in-memory LRU) for 60 seconds to avoid expensive aggregation on every page load
19. 🟡 Add "Comparison Mode" — select two date ranges and see charts overlaid for comparison
20. 🟡 Add "Export Dashboard as PDF" using `html2canvas` + `jspdf` — captures the charts section and downloads as A4 PDF

---

# Module 12 — Reports & Export

## What It Covers

Generates professional downloadable reports from the detection history. Supports PDF (with reportlab), CSV, and Excel (with openpyxl) formats. Users select a date range and report type; the system assembles a structured document with statistics, charts, and per-detection tables.

## Why It Matters

Enforcement agencies and auditors need formal documentation. Being able to export a structured PDF or spreadsheet turns the system into a legitimate tool for regulatory compliance.

## Tasks

1. 🔴 Create `GET /api/reports/detections/` endpoint:
   - Accepts `date_from`, `date_to`, `mode`, `model_id` query params
   - Returns paginated DetectionRecord data
   - Requires `IsAuthenticated`
2. 🔴 Create `GET /api/reports/detections/export/csv/`:
   - Streams CSV response
   - Columns: `ID, Date, User, Model, Mode, Object Count, Detection Details, Inference Time (ms)`
   - `detections` JSON flattened to a string column
3. 🔴 Create `GET /api/reports/detections/export/excel/`:
   - Uses `openpyxl` to build `.xlsx`
   - Sheet 1 "Summary": total detections, per-model counts, avg confidence, violation rate
   - Sheet 2 "Detections": same columns as CSV, with auto-filter enabled
   - Sheet 3 "Model Performance": per-model accuracy, avg inference time, total detections
4. 🔴 Create `GET /api/reports/detections/export/pdf/`:
   - Uses `reportlab`
   - Header: "SmartRoadSafety Detection Report", date range, generated-at timestamp
   - Summary stats table
   - Top 10 detection records with thumbnail, date, model, object count
   - Footer with page numbers
5. 🔴 Add a watermark to all PDFs: diagonal "CONFIDENTIAL" text in light gray
6. 🔴 Frontend: create `src/pages/Reports.jsx`:
    - Date range picker (from/to inputs)
    - Report type selector: PDF / CSV / Excel
    - "Generate Report" button
    - Preview panel showing summary stats before download
7. 🔴 Frontend: implement download trigger:
    - Use `axios` with `responseType: 'blob'`
    - Create object URL from blob
    - Trigger download via `<a download>`
8. 🔴 Backend: create `GET /api/reports/summary/` — returns just the summary stats (for the preview panel)
9. 🔴 Add `model_id` filter to all report endpoints — allows generating a report for a specific model
10. 🔴 Add user role check: only admins can generate reports for other users
11. 🔴 Add `GET /api/reports/templates/` — returns available report templates (Default, Violations Only, Model Performance)
12. 🟡 Add "Scheduled Reports":
    - Store `report_frequency` in user profile (None / Daily / Weekly / Monthly)
    - Create Django management command `send_scheduled_reports` for cron
    - Email reports via SMTP (or SendGrid) as attachment
13. 🟡 Add "Share Report" — generate a signed URL valid for 7 days for the PDF report
14. 🟡 Add QR code to PDF footer — links back to the detection in the web app
15. 🟡 Add chart rendering to PDF using `reportlab.graphics.shell` — simple bar charts inline in the report
16. 🟡 Add bulk export: "Export all detections" — streams 10,000+ records without memory blow-up using Django streaming response
17. 🟡 Add branding: custom logo placeholder in PDF header (configurable via admin)
18. 🟡 Add password protection to exported PDFs using `reportlab` encryption
19. 🟡 Write `test_reports.py` — verify CSV has correct headers, PDF is valid PDF, Excel has correct sheets
20. 🟡 Add "Redaction Mode" — allows users to redact specific detections before exporting (sets detected class to "REDACTED")

---

# Module 13 — Deployment & Production Optimization

## What It Covers

Transitions the development setup to a production-ready deployment. Switches from SQLite to PostgreSQL, configures Gunicorn + Nginx, Dockerizes the stack, adds monitoring, sets up CI/CD, and prepares the application for hosting on a cloud platform.

## Why It Matters

A project that only runs on a developer's laptop isn't a product. This module makes the system deployable, observable, and maintainable in production.

## Tasks

1. 🔴 Switch database from SQLite to PostgreSQL:
   - Install `psycopg2-binary` or `psycopg[binary]`
   - Update `settings.py` DATABASES config to use `DATABASE_URL` env var
   - Add `dj-database-url` package to parse the URL
2. 🔴 Update `settings.py` for production:
   - `DEBUG = False`
   - `SECRET_KEY` from env var (fail on startup if missing)
   - `ALLOWED_HOSTS` from env var
   - `SECURE_SSL_REDIRECT = True`
   - `SESSION_COOKIE_SECURE = True`
   - `CSRF_COOKIE_SECURE = True`
   - `X_FRAME_OPTIONS = DENY`
3. 🔴 Configure WhiteNoise for static files:
   - Install `whitenoise`
   - Add to `MIDDLEWARE` (must be first after SecurityMiddleware)
   - Run `python manage.py collectstatic`
4. 🔴 Create `requirements.txt` with pinned versions:
   ```
   Django==6.0.7
   djangorestframework==3.17.1
   djangorestframework-simplejwt==5.5.1
   django-cors-headers==4.9.0
   psycopg2-binary==2.9.12
   gunicorn==24.0.0
   Pillow==12.3.0
   opencv-python-headless==4.10.0.84
   ultralytics==8.4.100
   reportlab==5.1.0
   openpyxl==3.1.5
   python-dotenv==1.2.2
   dj-database-url==2.3.0
   dj-static==0.0.6
   whitenoise==6.10.0
   sentry-sdk==2.23.0
   ```
5. 🔴 Create `requirements-dev.txt` — adds `pytest`, `pytest-django`, `black`, `flake8`
6. 🔴 Create `Procfile`: `web: gunicorn smartroadsafety.wsgi --workers 4 --threads 2 --bind 0.0.0.0:$PORT`
7. 🔴 Create `render.yaml` for Render.com deployment:
   - Build command: `pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput`
   - Start command: from `Procfile`
   - Environment variables: `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`
8. 🔴 Create `Dockerfile`:
   ```dockerfile
   FROM python:3.12-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   RUN python manage.py collectstatic --noinput
   CMD ["gunicorn", "smartroadsafety.wsgi", "--bind", "0.0.0.0:8000"]
   ```
9. 🔴 Create `docker-compose.yml`:
   - Service `db`: PostgreSQL 16 image with volume
   - Service `web`: Django app (builds from Dockerfile), depends on `db`
   - Service `redis`: Redis 7 (for future Celery cache)
10. 🔴 Create `.dockerignore`: `venv/`, `__pycache__/`, `*.pyc`, `.env`, `db.sqlite3`, `node_modules/`, `frontend/node_modules/`
11. 🔴 Create `nginx.conf`:
    - Listen 80
    - Location `/static/` → alias to `staticfiles/` directory
    - Location `/media/` → alias to `media/` directory
    - Location `/` → proxy_pass to `127.0.0.1:8000` (Gunicorn)
    - Client max body size: 100MB (for video uploads)
12. 🔴 Update `vite.config.js` for production:
    - Set `base: '/'` (or custom domain path)
    - Configure asset inlining limit
13. 🔴 Create `frontend/.env.production` with `VITE_API_URL=https://api.smartroadsafety.com`
14. 🔴 Add Sentry monitoring:
    - Install `sentry-sdk`
    - Init in `smartroadsafety/wsgi.py` and `smartroadsafety/asgi.py`
    - Set `SENTRY_DSN` env var
15. 🔴 Add request ID tracing:
    - Install `django-log-request-id`
    - Add `LogRequestIdMiddleware` to MIDDLEWARE
    - Include `X-Request-ID` in all API responses
16. 🔴 Add `GET /health/` endpoint:
    - Checks: DB connection, cache connection
    - Returns: `{"status": "ok", "version": "1.0.0"}`
    - Used by load balancer health checks
17. 🔴 Production deployment checklist in `DEPLOYMENT.md`:
    - Database migration plan
    - Static file collection
    - Environment variables to set
    - DNS configuration
    - SSL certificate setup
18. 🔴 Add `python manage.py check --deploy` to CI pipeline and fail if warnings
19. 🟡 Set up GitHub Actions workflow `.github/workflows/ci.yml`:
    - On push to `main`: run tests, lint, build Docker image, push to registry
    - On PR: run tests + lint only
20. 🟡 Add Celery for async task queue:
    - `celery.py` in smartroadsafety/
    - Replace synchronous video processing with Celery tasks
    - Add Redis as broker
    - Add `GET /api/jobs/<id>/status/` endpoint for video job progress
21. 🟡 Add uWSGI as alternative to Gunicorn (better for long-polling / websockets)
22. 🟡 Set up staging environment on Render/Fly.io with automatic deployment from `staging` branch

---

# Cross-Module Cleanup Tasks

Run once, after all modules are complete, before first production deployment.

1. 🟡 Audit all API endpoints: verify every non-auth endpoint requires `IsAuthenticated` (except login, register, health)
2. 🟡 Add DRF throttle classes:
    - Anonymous: 60 requests/minute
    - Authenticated: 300 requests/minute
    - Detection endpoints: 30 requests/minute per user
3. 🟡 Add `django-logging` config — log to file with rotation (10MB, 5 files)
4. 🟡 Add API documentation:
    - Install `drf-spectacular`
    - Add `/api/schema/` endpoint (OpenAPI JSON)
    - Add `/api/docs/` Swagger UI
    - Document all endpoints with descriptions and example responses
5. 🟡 Replace all `print()` statements with `logging.getLogger(__name__).info/debug/warning/error`
6. 🟡 Add `django-admin-extra` or a custom admin index with system health at `/admin/`
7. 🟡 Verify all file uploads: enforce max file sizes at both serializer and Nginx level
8. 🟡 Add `Content-Security-Policy` header via `django-csp`
9. 🟡 Run `python manage.py shell` smoke test: create a user, upload a model, run a detection — all from the shell
10. 🟡 Performance audit: use `django-debug-toolbar` in dev, profile the detection endpoint, identify and fix any N+1 queries
