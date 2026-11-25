
import csv
import json
from pathlib import Path
from typing import Iterator


def stream_activities(file_path: str | Path) -> Iterator[dict]:
    """
    Read task activity records one at a time from a JSONL file.
    Each line must contain one JSON object.
    """
    path = Path(file_path)

    with path.open("r", encoding="utf-8-sig") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"Invalid JSON on line {line_number}"
                ) from error

            if not isinstance(record, dict):
                raise ValueError(
                    f"Line {line_number} must contain a JSON object"
                )

            yield record


def calculate_productivity(activities: Iterator[dict]) -> dict:
    """
    Calculate activity counts grouped by user.
    """
    results = {}

    for activity in activities:
        user_id = activity.get("user_id")

        if not user_id:
            continue

        if user_id not in results:
            results[user_id] = {
                "total_activities": 0,
                "completed_tasks": 0,
            }

        results[user_id]["total_activities"] += 1

        if activity.get("action") == "task_completed":
            results[user_id]["completed_tasks"] += 1

    return results


def find_overdue_tasks(tasks: Iterator[dict], current_date: str) -> list[dict]:
    """
    Find incomplete tasks whose due date is before the current date.
    Dates must use YYYY-MM-DD format.
    """
    overdue = []

    for task in tasks:
        due_date = task.get("due_date")
        status = task.get("status", "").lower()

        if due_date and status not in ("completed", "done"):
            if due_date < current_date:
                overdue.append(task)

    return overdue


def export_json(data: object, output_path: str | Path) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)


def export_csv(data: list[dict], output_path: str | Path) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if not data:
        return

    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
