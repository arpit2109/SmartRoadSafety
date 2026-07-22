# SmartRoadSafety
A yolo based trained model project with a capability to detect object(vehicle(bike),person,person with helmet)

## Setup Instructions

### Backend (Django)
1. Navigate to the `backend` directory: `cd backend`
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt` (create this file if not exists)
5. Set up the `.env` file in the `backend` directory with `SECRET_KEY`, `DEBUG`, and `ALLOWED_HOSTS`.
6. Apply migrations: `python manage.py migrate`
7. Run the development server: `python manage.py runserver`

### Frontend (React + Vite)
1. Navigate to the `frontend` directory: `cd frontend`
2. Create a `.env` file and add: `VITE_API_URL=http://localhost:8000`
3. Install dependencies: `npm install`
4. Run the development server: `npm run dev`
5. To build for production: `npm run build`
