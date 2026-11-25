
from datetime import date
from pathlib import Path
import sys
import json

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROCESSOR_PATH = PROJECT_ROOT / "python" / "worksphere_processor"
SAMPLES_DIR = PROCESSOR_PATH / "samples"

sys.path.insert(0, str(PROCESSOR_PATH))

from processor import (
    stream_activities,
    calculate_productivity,
    find_overdue_tasks,
)

app = FastAPI(
    title="WorkSphere Analytics Service",
    description="Analytics API for WorkSphere project activity and tasks.",
    version="1.0.0",
)


class AnalyticsRequest(BaseModel):
    activities_file: str = "activities.jsonl"
    tasks_file: str = "tasks.json"
    current_date: date = Field(default_factory=date.today)


def resolve_sample_file(filename: str) -> Path:
    file_name = Path(filename)

    if file_name.is_absolute() or len(file_name.parts) != 1:
        raise HTTPException(
            status_code=400,
            detail="Only filenames inside the samples directory are allowed",
        )

    file_path = (SAMPLES_DIR / file_name).resolve()

    if file_path.parent != SAMPLES_DIR.resolve():
        raise HTTPException(
            status_code=400,
            detail="Invalid file path",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    return file_path


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "worksphere-analytics",
    }


@app.post("/analytics/productivity")
def productivity_report(request: AnalyticsRequest):
    activities_path = resolve_sample_file(request.activities_file)

    try:
        results = calculate_productivity(
            stream_activities(activities_path)
        )
        return {
            "users": results,
            "user_count": len(results),
        }
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.post("/analytics/overdue")
def overdue_report(request: AnalyticsRequest):
    tasks_path = resolve_sample_file(request.tasks_file)

    try:
        with tasks_path.open("r", encoding="utf-8-sig") as file:
            tasks = json.load(file)

        if not isinstance(tasks, list):
            raise ValueError("Tasks file must contain a JSON array")

        overdue = find_overdue_tasks(
            iter(tasks),
            request.current_date.isoformat(),
        )

        return {
            "overdue_tasks": overdue,
            "count": len(overdue),
        }
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))
