

\# WorkSphere Analytics Service



\## Overview

A FastAPI-based analytics service for the WorkSphere project management platform. It reuses the Python processing package from Assessment 05.



\## Features

\- Health check endpoint

\- Productivity analytics based on task activity records

\- Overdue task identification

\- JSON request validation using Pydantic

\- Secure sample-file access restricted to the samples directory

\- Automatic API documentation through Swagger UI

\- Automated API tests



\## Technology

\- Python 3

\- FastAPI

\- Uvicorn

\- Pydantic

\- unittest

\- FastAPI TestClient



\## Run the Service



From the project root:



```bash

python -m uvicorn main:app --app-dir python/analytics\_service --reload --port 8001

```



Open Swagger documentation:



http://127.0.0.1:8001/docs



\## API Endpoints



\### GET /health

Checks service availability.



\### POST /analytics/productivity

Calculates activity totals and completed tasks for each user.



Example request:



```json

{

&#x20; "activities\_file": "activities.jsonl"

}

```



\### POST /analytics/overdue

Returns incomplete tasks whose due dates have passed.



Example request:



```json

{

&#x20; "tasks\_file": "tasks.json",

&#x20; "current\_date": "2026-11-25"

}

```



\## Run Tests



From the project root:



```bash

python -m unittest discover -s python/analytics\_service/tests -v

```



\## Security

The API only allows filenames from the configured samples directory. Absolute paths and directory traversal attempts are rejected.



\## Related Package

The service uses the reusable processing package located at `python/worksphere\_processor/`.



