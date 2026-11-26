
from datetime import date
import math
from pathlib import Path
import sys
import json
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse

from rate_limit import (
    FixedWindowRateLimiter,
    RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_SECONDS,
)

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
    description=(
        "Version 1 of the WorkSphere analytics API. Routes are available "
        "under /v1 and at their original unversioned paths for backward "
        "compatibility. Analytics reports support page and limit query "
        "parameters. A per-process, per-client fixed-window request limit "
        "is enforced."
    ),
    version="1.0.0",
    openapi_tags=[
        {"name": "Health", "description": "Analytics service health."},
        {"name": "Productivity", "description": "Activity-based productivity reports."},
        {"name": "Tasks", "description": "Overdue task reports."},
    ],
)


class ProductivityRequest(BaseModel):
    activities_file: str = Field(
        default="activities.jsonl",
        description="A single JSONL filename inside the configured samples directory.",
        examples=["activities.jsonl"],
    )


class OverdueRequest(BaseModel):
    tasks_file: str = Field(
        default="tasks.json",
        description="A single JSON filename inside the configured samples directory.",
        examples=["tasks.json"],
    )
    current_date: date = Field(
        default_factory=date.today,
        description="Report tasks due before this date.",
        examples=["2026-11-25"],
    )


class HealthResponse(BaseModel):
    status: str = Field(examples=["healthy"])
    service: str = Field(examples=["worksphere-analytics"])


class UserProductivity(BaseModel):
    total_activities: int = Field(examples=[12])
    completed_tasks: int = Field(examples=[4])


class PaginationMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page: int
    limit: int
    total: int
    total_pages: int = Field(alias="totalPages")
    has_next: bool = Field(alias="hasNext")
    has_previous: bool = Field(alias="hasPrevious")


class ProductivityResponse(BaseModel):
    users: dict[str, UserProductivity]
    user_count: int = Field(examples=[3])
    pagination: PaginationMetadata


class OverdueResponse(BaseModel):
    overdue_tasks: list[dict[str, Any]]
    count: int = Field(examples=[1])
    pagination: PaginationMetadata


router = APIRouter()
rate_limiter = FixedWindowRateLimiter(
    RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_SECONDS,
)


@app.middleware("http")
async def apply_rate_limit(request: Request, call_next):
    if request.url.path in {"/docs", "/openapi.json", "/redoc"} or request.url.path.startswith(
        ("/docs/", "/redoc/")
    ):
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    allowed, headers = rate_limiter.check(client_ip)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please retry later."},
            headers=headers,
        )

    response = await call_next(request)
    response.headers.update(headers)
    return response


def paginate(items: list[Any], page: int, limit: int) -> tuple[list[Any], PaginationMetadata]:
    total = len(items)
    total_pages = math.ceil(total / limit)
    start = (page - 1) * limit
    metadata = PaginationMetadata(
        page=page,
        limit=limit,
        total=total,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_previous=page > 1,
    )
    return items[start : start + limit], metadata


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


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check analytics service health",
    tags=["Health"],
)
def health_check():
    return {
        "status": "healthy",
        "service": "worksphere-analytics",
    }


@router.post(
    "/analytics/productivity",
    response_model=ProductivityResponse,
    summary="Calculate productivity metrics",
    description=(
        "Reads activity JSONL from the samples directory and returns "
        "per-user activity and completed-task counts. Results are ordered by "
        "user ID and paginated using page (default 1) and limit (default 20, "
        "maximum 100)."
    ),
    tags=["Productivity"],
    responses={
        400: {
            "description": "The input file contains invalid JSON or records.",
            "content": {
                "application/json": {
                    "example": {"detail": "Invalid JSON on line 2"}
                }
            },
        },
        404: {
            "description": "The requested sample file does not exist.",
            "content": {
                "application/json": {
                    "example": {"detail": "File not found"}
                }
            },
        },
        422: {
            "description": "The request body failed validation.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": [
                            {
                                "loc": ["body", "activities_file"],
                                "msg": "Input should be a valid string",
                                "type": "string_type",
                            }
                        ]
                    }
                }
            },
        },
        429: {
            "description": "The client exceeded the configured request limit.",
            "headers": {
                "Retry-After": {
                    "description": "Seconds to wait before retrying.",
                    "schema": {"type": "integer"},
                }
            },
            "content": {
                "application/json": {
                    "example": {"detail": "Rate limit exceeded. Please retry later."}
                }
            },
        },
    },
)
def productivity_report(
    request: ProductivityRequest,
    page: int = Query(
        default=1,
        ge=1,
        description="One-based page number.",
        examples=[1],
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Number of users per page, from 1 through 100.",
        examples=[20],
    ),
):
    activities_path = resolve_sample_file(request.activities_file)

    try:
        results = calculate_productivity(
            stream_activities(activities_path)
        )
        entries = sorted(results.items(), key=lambda item: str(item[0]))
        page_entries, pagination = paginate(entries, page, limit)
        return {
            "users": {str(user_id): metrics for user_id, metrics in page_entries},
            "user_count": len(results),
            "pagination": pagination,
        }
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post(
    "/analytics/overdue",
    response_model=OverdueResponse,
    summary="Find overdue incomplete tasks",
    description=(
        "Reads a JSON array from the samples directory and returns tasks "
        "whose due date is before current_date and whose status is not "
        "completed or done. Results are paginated using page (default 1) and "
        "limit (default 20, maximum 100)."
    ),
    tags=["Tasks"],
    responses={
        400: {
            "description": "The task file is not a JSON array or contains invalid data.",
            "content": {
                "application/json": {
                    "example": {"detail": "Tasks file must contain a JSON array"}
                }
            },
        },
        404: {
            "description": "The requested sample file does not exist.",
            "content": {
                "application/json": {
                    "example": {"detail": "File not found"}
                }
            },
        },
        422: {
            "description": "The request body failed validation.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": [
                            {
                                "loc": ["body", "current_date"],
                                "msg": "Input should be a valid date",
                                "type": "date_from_datetime_parsing",
                            }
                        ]
                    }
                }
            },
        },
        429: {
            "description": "The client exceeded the configured request limit.",
            "headers": {
                "Retry-After": {
                    "description": "Seconds to wait before retrying.",
                    "schema": {"type": "integer"},
                }
            },
            "content": {
                "application/json": {
                    "example": {"detail": "Rate limit exceeded. Please retry later."}
                }
            },
        },
    },
)
def overdue_report(
    request: OverdueRequest,
    page: int = Query(
        default=1,
        ge=1,
        description="One-based page number.",
        examples=[1],
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Number of overdue tasks per page, from 1 through 100.",
        examples=[20],
    ),
):
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

        page_items, pagination = paginate(overdue, page, limit)
        return {
            "overdue_tasks": page_items,
            "count": len(overdue),
            "pagination": pagination,
        }
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


app.include_router(router, prefix="/v1")
app.include_router(router)


def custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )
    schema["x-api-versioning"] = {
        "status": "v1-with-legacy-aliases",
        "versionedPrefix": "/v1",
        "legacyPrefix": "/",
    }
    schema["x-rate-limit-policy"] = {
        "status": "enforced",
        "scope": "per-process, per-client-IP",
        "algorithm": "fixed-window",
        "maxRequests": RATE_LIMIT_MAX_REQUESTS,
        "windowSeconds": RATE_LIMIT_WINDOW_SECONDS,
        "headers": [
            "RateLimit-Limit",
            "RateLimit-Remaining",
            "RateLimit-Reset",
            "RateLimit-Policy",
            "Retry-After",
        ],
        "excludedPaths": ["/docs", "/openapi.json", "/redoc"],
    }

    rate_limit_response = {
        "description": "The client exceeded the configured request limit.",
        "headers": {
            "RateLimit-Limit": {
                "description": "Maximum requests allowed in the current window.",
                "schema": {"type": "integer"},
            },
            "RateLimit-Remaining": {
                "description": "Requests remaining in the current window.",
                "schema": {"type": "integer"},
            },
            "RateLimit-Reset": {
                "description": "Seconds until the current window resets.",
                "schema": {"type": "integer"},
            },
            "RateLimit-Policy": {
                "description": "Configured request quota and window.",
                "schema": {"type": "string"},
            },
            "Retry-After": {
                "description": "Seconds to wait before retrying.",
                "schema": {"type": "integer"},
            },
        },
        "content": {
            "application/json": {
                "example": {"detail": "Rate limit exceeded. Please retry later."}
            }
        },
    }

    for path_item in schema["paths"].values():
        for operation in path_item.values():
            if isinstance(operation, dict) and "responses" in operation:
                operation["responses"]["429"] = rate_limit_response

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi
