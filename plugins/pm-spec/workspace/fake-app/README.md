# TaskFlow

A collaborative task management SaaS for small-to-medium teams.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, TailwindCSS
- **Backend:** Django 4.2 + Django REST Framework
- **Database:** PostgreSQL 15
- **Auth:** JWT via `djangorestframework-simplejwt`
- **CI:** GitHub Actions

## Local Development

```bash
# Backend
cd backend && pip install -r ../requirements.txt
python manage.py migrate && python manage.py runserver

# Frontend
cd frontend && npm install && npm run dev
```

## Architecture

Teams own Projects. Projects contain Tasks. Users belong to Teams and can be
assigned to Tasks. Comments are threaded on Tasks. Notifications are delivered
in-app (email notifications are not yet implemented).

## Status

MVP shipped. Core CRUD for tasks, projects, and comments is working.
Notifications module is scaffolded but incomplete.
