# SmartRoadSafety — Master Todo List

Generated: 2026-07-22

## Status Legend
- ✅ Done (shipped)
- 🟡 Partial / needs work
- 🔴 Not started

---

## Module 1 — Project Initialization
> **Status: ✅ ~95%** — Django project, React + Vite, Tailwind, Axios, DRF, JWT, CORS all configured.

### Remaining Tasks
1. 🟡 Add `python-dotenv` / `.env` handling — `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` should all come from `.env`, not hardcoded in `settings.py`
2. 🟡 Create `frontend/.env` with `VITE_API_URL=http://localhost:8000` for frontend API base URL
3. 🟡 Add `Procfile` / `render.yaml` stubs for future deployment (Module 13)
4. 🟡 Create `CONTRIBUTING.md` or project README with setup instructions
5. 🟡 Verify the React frontend builds (`npm run build`) without errors
6. 🟡 Add `.gitignore` entries for `venv/`, `__pycache__/`, `*.pyc`, `.env`, `db.sqlite3`, `media/results/`, `media/uploads/`

---

## Module 2 — Authentication & User Management
> **Status: ✅ ~90%** — CustomUser, Profile, JWT register/login/refresh/profile(PATCH) all done. Missing logout + admin tweaks.

### Tasks
1. 🔴 Add `POST /api/auth/logout/` endpoint that blacklists the refresh token (`rest_framework_simplejwt.token_blacklist`)
2. 🔴 Add logout serializer (single `refresh` token field)
3. 🔴 Wire logout into `accounts/urls.py`
4. 🟡 Update `CustomUserAdmin` to display `contact_no` and `email` in the user list with search/filter (was in progress in earlier session — verify it's working)
5. 🟡 Update `ProfileAdmin` to show profile picture thumbnail in the list view
6. 🟡 Add `date_joined` and `is_active` to user admin list display
7. 🟡 Add admin actions: "Deactivate selected users", "Activate selected users"
8. 🔴 Add `POST /api/auth/change-password/` endpoint — requires auth, validates old password, saves new one
9. 🔴 Write Django tests for register, login, logout, profile read/patch endpoints
10. 🟡 Create a superuser seed script so the project works out of the box (`python manage.py createsuperuser`)

---

## Module 3 — AI Model Management System
> **Status: 🟡 ~85%** — AIModel, loader, cache, admin, API, services, signals all done. Missing tests and a `classes` field.

### Tasks
1. 🔴 Add `classes` JSONField to `AIModel` — stores `["driver_with_helmet", "bike", ...]` so the API can return class names; add migration
2. 🔴 Update `AIModelUploadSerializer` and `AIModelUpdateSerializer` to accept/return `classes` field
3. 🔴 Update `AIModelAdmin` to show `classes` as a JSON textarea in the change form
4. 🔴 Write `test_models.py` — AIModel creation, unique constraint, defaults, string representation
5. 🔴 Write `test_services.py` — set_as_default unsets sibling, deactivate clears cache, replace_weight_file removes old file
6. 🔴 Write `test_cache.py` — concurrent get/set under ThreadPoolExecutor, hit/miss/load counters
7. 🔴 Write `test_api.py` — full CRUD via DRF APIClient, anonymous=401, regular user=403 on upload, admin=201; multipart upload with a dummy `.pt` file in `tests/fixtures/`
8. 🔴 Write `test_loader.py` — monkey-patch `YOLO` constructor, verify second call hits cache
9. 🔴 Run all tests with `python manage.py test ai`, fix any failures
10. 🔴 Add `classes` argument to `register_model` management command
11. 🔴 Add `description` CharField to `AIModel` (free-text field for model notes) + migration
12. 🔴 Add `imgsz` IntegerField to `AIModel` (default 640 — inference image size)
13. 🟡 Run `makemigrations` and `migrate` for the new fields (`classes`, `description`, `imgsz`)
14. 🟡 Verify the admin shows the new fields; update serializers to include them

---

## Module 4 — Detection Engine
> **Status: 🔴 0%** — `detector.py` and `model_selector.py` are empty stubs. `DetectionService` in detection app imports them but they don't exist.

### Tasks
1. 🔴 Implement `ai/model_selector.py` — `select_best_model(category)` that queries `AIModel.objects.filter(category, is_active=True, is_default=True).first()`; raise `NoDefaultModel` if none found
2. 🔴 Implement `ai/detector.py` — `YOLODetector` class:
   - `__init__(self, ai_model)` — loads via `load_model()` from `model_loader.py`
   - `run_inference(self, image_np, conf=None, iou=None)` — calls `self.model.predict()`, returns structured dict
3. 🔴 Structure the detection result dict to include: `boxes` (x1,y1,x2,y2), `scores`, `class_names`, `class_ids`, `count`, `inference_time_ms`, `annotated_image`
4. 🔴 Implement annotated image drawing — OpenCV rectangles + labels on a copy of the input image; save to `media/results/`
5. 🔴 Wire `detection/services.py` — update `DetectionService.process_image()` to use the real detector and return structured results
6. 🔴 Create `POST /api/models/detect/image/` endpoint in `ai/views.py`:
   - Accept multipart image upload
   - Accept optional `model_id` (int) or `category` (str) param
   - Validate image (size, type)
   - Run detection via `detector.py`
   - Return JSON with boxes, scores, class_names, annotated_image URL, inference time
   - Require `IsAuthenticated`
7. 🔴 Create `POST /api/models/detect/image/` URL in `ai/urls.py`
8. 🔴 Implement error handling in detector: `ModelNotFound`, `ModelFileMissing`, `ModelLoadError` all return clean 4xx/5xx with a message
9. 🔴 Implement `ai/model_selector.py` — add `select_model_by_id(id)` alongside `select_best_model`
10. 🔴 Write `test_detector.py` — mock YOLO, verify structure of result dict, verify annotated image saved
11. 🔴 Write `test_model_selector.py` — verify it picks default active model, raises on inactive/missing
12. 🟡 Benchmark test: measure inference time on a known test image; log warning if >2s
13. 🟡 Add `conf_threshold` and `iou_threshold` override params to the detection endpoint

---

## Module 5 — Frontend Foundation
> **Status: 🟡 ~30%** — Pages exist but are decorative. No JWT storage, no auth context, no real API calls.

### Tasks
1. 🔴 Create `src/context/AuthContext.jsx` — stores JWT access/refresh in localStorage; provides `login()`, `logout()`, `user` object; auto-refresh on 401
2. 🔴 Create `src/utils/api.js` — axios instance with base URL `import.meta.env.VITE_API_URL`, interceptors for JWT attach and 401 auto-refresh
3. 🔴 Create `src/components/ProtectedRoute.jsx` — redirects to `/login` if no token
4. 🔴 Update `src/App.jsx` — wrap protected routes with `<ProtectedRoute>`; add `/profile` route
5. 🔴 Wire `src/pages/Login.jsx` — call `POST /api/auth/login/`, store tokens, redirect to `/`
6. 🔴 Wire `src/pages/Register.jsx` — call `POST /api/auth/register/`, redirect to `/login` on success
7. 🔴 Create `src/pages/Profile.jsx` — fetch `GET /api/auth/profile/`, show/edit form for firstname, lastname, profile_picture; PATCH on save
8. 🔴 Create `src/components/Navbar.jsx` (replaces hardcoded header in Layout) — shows user avatar initial from token, logout button
9. 🔴 Add logout call to sidebar — call `POST /api/auth/logout/` then clear tokens and redirect
10. 🔴 Update `src/pages/Dashboard.jsx` — fetch real stats from backend API once history endpoint exists (Module 10); show placeholder zeros until then
11. 🔴 Create `src/components/Loader.jsx` — reusable spinner overlay component
12. 🔴 Create `src/components/Alert.jsx` — reusable success/error alert banner
13. 🟡 Create `src/components/UploadCard.jsx` — reusable drag-and-drop file upload component with preview
14. 🟡 Add error handling UI to all API calls (catch 401/403/500, show Alert)
15. 🟡 Add loading states to Dashboard, Profile, ManualDetection pages

---

## Module 6 — Manual Detection (Frontend)
> **Status: 🟡 ~30%** — Page exists but hardcoded categories, no real API wiring.

### Tasks
1. 🔴 Replace hardcoded category `<select>` with `GET /api/models/` — populate from AIModel API (filter `?is_active=true`)
2. 🔴 Replace hardcoded `POST /api/detection/image/` with `POST /api/models/detect/image/`
3. 🔴 Add confidence threshold slider — default from model metadata, override sent as param
4. 🔴 Add IoU threshold slider — default from model metadata
5. 🔴 Show model info card — name, version, category, accuracy from AIModel detail response
6. 🔴 Create separate upload section for video — same detection endpoint with `video` field instead of `image`
7. 🔴 Display annotated image result with bounding boxes overlaid
8. 🔴 Display detection table — class name, confidence %, bounding box coordinates
9. 🔴 Add "Download Result" button — download the annotated image from the returned URL
10. 🔴 Add "Copy to Clipboard" for detection summary text
11. 🔴 Add drag-and-drop support on the upload area
12. 🔴 Show detection history card at bottom — link to Module 10
13. 🟡 Video detection — show progress bar (processed frames / total frames)
14. 🟡 Display inference time in results card

---

## Module 7 — Automatic Model Selection
> **Status: 🔴 0%**

### Tasks
1. 🔴 Implement rule-based scene selector in `ai/model_selector.py`:
   - `detect_scene(image_np)` — run YOLO on full image with low conf to get coarse objects
   - Map detected classes → category: e.g. `"bike" in classes or "motorcycle" in classes → "helmet"`
2. 🔴 Add `select_auto(image_np)` function — calls `detect_scene`, then `select_best_model(category)`
3. 🔴 Create `POST /api/models/detect/auto/` endpoint — receives image, runs auto-select, returns result
4. 🔴 Wire into `ai/urls.py`
5. 🔴 Frontend: create `src/pages/AutoDetection.jsx` — one-click "Auto Detect" with no model dropdown
6. 🔴 Frontend: show which category was auto-selected in the results
7. 🔴 Future: design prompt for a lightweight scene-classifier model to replace rule-based approach
8. 🟡 Add scene mapping configuration to `settings.py` as a dict — so rules can be tweaked without code changes
9. 🟡 Write `test_auto_selector.py` — mock scene detection, verify correct category returned
10. 🟡 Handle edge case: no objects detected → raise `NoDefaultModel` with helpful message

---

## Module 8 — Video Detection
> **Status: 🔴 0%**

### Tasks
1. 🔴 Create `POST /api/models/detect/video/` endpoint — accepts video file upload
2. 🔴 Implement frame extraction — use OpenCV to read video, iterate frames
3. 🔴 Run YOLO detection on each frame
4. 🔴 Draw bounding boxes on each processed frame
5. 🔴 Rebuild video from processed frames using OpenCV `VideoWriter`
6. 🔴 Save processed video to `media/results/videos/`
7. 🔴 Return JSON: processed video URL, frame count, object counts per frame, total inference time, FPS
8. 🔴 Add progress tracking — use Django signals or Redis pub/sub for long-running video jobs (or at minimum return immediately and save job ID)
9. 🔴 Frontend: create `src/pages/VideoDetection.jsx` — upload video, show progress bar, display processed video player on completion
10. 🔴 Frontend: add "Download Processed Video" button
11. 🔴 Frontend: display per-frame detection summary table
12. 🟡 Handle video encoding mismatches (different codecs, rotation)
13. 🟡 Add FPS display on processed video — overlay inference FPS per frame
14. 🟡 Write `test_video_detection.py` — use a short 1-second test video, verify output exists and has frames

---

## Module 9 — Live Webcam Detection
> **Status: 🔴 0%**

### Tasks
1. 🔴 Frontend: create `src/pages/WebcamDetection.jsx` — request camera access via `navigator.mediaDevices.getUserMedia`
2. 🔴 Frontend: render video element with live camera feed
3. 🔴 Frontend: capture frames at configurable interval (e.g. every 500ms)
4. 🔴 Frontend: send each frame to `POST /api/models/detect/image/` via canvas `toBlob()`
5. 🔴 Frontend: overlay bounding box SVG/canvas on top of video feed showing live detections
6. 🔴 Frontend: show FPS counter (frames processed per second)
7. 🔴 Frontend: "Snapshot" button — capture current frame and save to history
8. 🔴 Frontend: "Start/Stop" recording button — save stream as WebM
9. 🔴 Backend: ensure webcam endpoint is fast — target <200ms per frame response
10. 🔴 Frontend: show confidence slider to filter low-confidence detections from display
11. 🟡 Add object tracking between frames — use SORT/deep-sort to reduce flicker
12. 🟡 Add alert overlay when "driver_without_helmet" is detected
13. 🟡 Add "Record" mode — accumulate frames and export as video

---

## Module 10 — Detection History
> **Status: 🔴 0%**

### Tasks
1. 🔴 Create `DetectionRecord` model in `detection/models.py`:
   - `user` FK → CustomUser
   - `uploaded_file` FileField (original image/video)
   - `result_file` FileField (annotated image/video) or URL
   - `ai_model` FK → AIModel
   - `detection_mode` CharField (`manual` | `auto` | `webcam`)
   - `confidence_used` FloatField
   - `iou_used` FloatField
   - `detections` JSONField (list of detected objects)
   - `object_count` IntegerField
   - `inference_time_ms` FloatField
   - `created_at` DateTimeField
2. 🔴 Run `makemigrations detection` and `migrate`
3. 🔴 Wire `DetectionService.process_image()` to save a `DetectionRecord` after each detection
4. 🔴 Create `GET /api/history/` endpoint — list records for authenticated user, filterable by `mode`, `ai_model`, `date`
5. 🔴 Create `GET /api/history/<id>/` — retrieve single record
6. 🔴 Create `DELETE /api/history/<id>/` — soft delete or hard delete record
7. 🔴 Create `GET /api/history/<id>/download/` — return annotated file download URL
8. 🔴 Register `DetectionRecord` in `detection/admin.py`
9. 🔴 Frontend: create `src/pages/History.jsx` — table of past detections with filters, thumbnail, date, model name, object count
10. 🔴 Frontend: add "Delete" and "Download" action buttons per row
11. 🔴 Frontend: add pagination (20 per page) with prev/next
12. 🟡 Frontend: add date range filter (from/to date pickers)
13. 🟡 Add `export_selected` checkbox bulk action — download as ZIP

---

## Module 11 — Dashboard & Analytics
> **Status: 🔴 0%**

### Tasks
1. 🔴 Create `GET /api/analytics/stats/` endpoint:
   - `total_detections` count
   - `detections_today` / `this_week` / `this_month`
   - `most_used_model` (model name + count)
   - `avg_confidence` float
   - `avg_inference_time_ms` float
2. 🔴 Create `GET /api/analytics/timeline/` endpoint — detections grouped by day for last 30 days (for line chart)
3. 🔴 Create `GET /api/analytics/model-usage/` endpoint — per-model detection counts (for bar chart)
4. 🔴 Create `GET /api/analytics/category-distribution/` endpoint — class-level object counts (for pie chart)
5. 🔴 Frontend: upgrade `src/pages/Dashboard.jsx` — replace hardcoded "1,234" stats with real API calls
6. 🔴 Frontend: add Line chart — Detection Timeline (using `recharts` or `chart.js`)
7. 🔴 Frontend: add Bar chart — Model Usage
8. 🔴 Frontend: add Pie/Doughnut chart — Category Distribution
9. 🔴 Frontend: add "Recent Activity" feed — last 5 detection records from history API
10. 🔴 Frontend: add "Quick Stats" cards — today's detections, active models, avg confidence
11. 🔴 Frontend: add date range selector to filter all charts
12. 🟡 Add "Export Dashboard as PDF" button (using `jspdf` + `html2canvas`)
13. 🟡 Add "Comparison Mode" — compare detection counts across two date ranges side by side

---

## Module 12 — Reports & Export
> **Status: 🔴 0%**

### Tasks
1. 🔴 Create `GET /api/reports/detections/` endpoint — paginated detection records with all fields
2. 🔴 Create `GET /api/reports/detections/export/csv/` — stream CSV of all user detections (username, model, date, object_count, detections JSON)
3. 🔴 Create `GET /api/reports/detections/export/excel/` — return `.xlsx` using `openpyxl` (Sheet: detections, second sheet: summary stats)
4. 🔴 Create `GET /api/reports/detections/export/pdf/` — return `.pdf` with `reportlab`:
   - Header: "SmartRoadSafety Detection Report"
   - Date range
   - Summary stats table
   - Per-detection table (thumbnail, date, model, object count)
5. 🔴 Frontend: create `src/pages/Reports.jsx` — date range picker, report type selector (PDF/CSV/Excel)
6. 🔴 Frontend: "Generate Report" button — fetches and triggers browser download
7. 🔴 Frontend: show report preview panel with stats summary before download
8. 🔴 Add `GET /api/reports/summary/` — returns just the summary stats for the report header
9. 🔴 Backend: add watermark to exported PDF
10. 🟡 Add "Scheduled Reports" — user can set email frequency (daily/weekly); store preference in user profile; cron job sends email (Module 13)

---

## Module 13 — Deployment & Production Optimization
> **Status: 🔴 0%**

### Tasks
1. 🔴 Switch database from SQLite to PostgreSQL — update `settings.py`, add `psycopg2-binary` to requirements
2. 🔴 Update `settings.py` for production — `DEBUG=False`, secure `SECRET_KEY` from env, `ALLOWED_HOSTS` from env
3. 🔴 Configure WhiteNoise or `django-storages` for static files in production
4. 🔴 Set up `requirements.txt` with pinned versions — separate `requirements.txt` and `requirements-dev.txt`
5. 🔴 Add `gunicorn` to requirements; create `Procfile` with `web: gunicorn smartroadsafety.wsgi`
6. 🔴 Create `render.yaml` deployment config (or `fly.toml` for Fly.io) with build + start commands
7. 🔴 Docker: create `Dockerfile` for the Django backend — Python 3.12, install system deps, copy requirements, install, copy code
8. 🔴 Docker: create `docker-compose.yml` — Django app + PostgreSQL service + optionally Redis
9. 🔴 Docker: create `.dockerignore`
10. 🔴 Add `nginx.conf` stub — serve static files, proxy API to Gunicorn, set upload body size to 100MB
11. 🔴 Frontend: update `vite.config.js` — set correct `base` URL for production build
12. 🔴 Frontend: add `.env.production` with `VITE_API_URL` pointing to deployed backend
13. 🔴 Add `django-cors-headers` CORS whitelist for production domain
14. 🔴 Add Sentry error monitoring — install `sentry-sdk`, init in `wsgi.py` / `settings.py`
15. 🔴 Add `django-log-request-id` for request tracing in production
16. 🔴 Production deployment checklist: verify all env vars, run `python manage.py check --deploy`, test with `gunicorn`
17. 🟡 Set up CI/CD — GitHub Actions workflow to run tests + build Docker image on push
18. 🟡 Add health check endpoint `GET /health/` for load balancer probes

---

## Cross-Module Cleanup (do once, before deployment)
1. 🟡 Remove all `print()` debug statements; replace with proper `logging`
2. 🟡 Add `django-cors-headers` allowed-origins config from env var
3. 🟡 Verify all API endpoints require authentication except login/register/docs
4. 🟡 Rate limiting: add `django-ratelimit` or DRF throttling classes on detection endpoints
5. 🟡 Add API documentation with `drf-spectacular` or `drf-swagger` (OpenAPI schema)
6. 🟡 Run `python manage.py check` and `python manage.py test` in CI pipeline
