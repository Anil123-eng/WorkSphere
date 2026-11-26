
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


def filter_by_organization(
    records: Iterator[dict], organization_id: int
) -> Iterator[dict]:
    """Yield only records explicitly scoped to the authenticated organization."""
    for record in records:
        record_organization_id = record.get("organization_id")
        if (
            type(record_organization_id) is int
            and record_organization_id == organization_id
        ):
            yield record


def stream_json_array(
    file_path: str | Path, chunk_size: int = 64 * 1024
) -> Iterator[dict]:
    """Read object records from a JSON array without retaining the whole file."""
    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")

    decoder = json.JSONDecoder()
    with Path(file_path).open("r", encoding="utf-8-sig") as file:
        buffer = ""
        position = 0
        eof = False

        def read_more() -> None:
            nonlocal buffer, position, eof
            if position:
                buffer = buffer[position:]
                position = 0
            chunk = file.read(chunk_size)
            if chunk:
                buffer += chunk
            else:
                eof = True

        def ensure_data() -> bool:
            while position >= len(buffer) and not eof:
                read_more()
            return position < len(buffer)

        def skip_whitespace() -> None:
            nonlocal position
            while True:
                while position < len(buffer) and buffer[position].isspace():
                    position += 1
                if position < len(buffer) or eof:
                    return
                read_more()

        read_more()
        skip_whitespace()
        if not ensure_data() or buffer[position] != "[":
            raise ValueError("Tasks file must contain a JSON array")
        position += 1
        has_item = False
        expecting_value = True

        while True:
            skip_whitespace()
            if not ensure_data():
                raise ValueError("Invalid JSON task array")

            if expecting_value and buffer[position] == "]":
                if has_item:
                    raise ValueError("Invalid JSON task array")
                position += 1
                break

            if expecting_value:
                try:
                    record, end = decoder.raw_decode(buffer, position)
                except json.JSONDecodeError as error:
                    if eof:
                        raise ValueError("Invalid JSON task array") from error
                    read_more()
                    continue

                if not isinstance(record, dict):
                    raise ValueError("Each task entry must be a JSON object")
                position = end
                has_item = True
                expecting_value = False
                yield record
                continue

            if buffer[position] == ",":
                position += 1
                expecting_value = True
            elif buffer[position] == "]":
                position += 1
                break
            else:
                raise ValueError("Invalid JSON task array")

        skip_whitespace()
        if ensure_data():
            raise ValueError("Unexpected content after JSON task array")


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


def paginate_overdue_tasks(
    tasks: Iterator[dict], current_date: str, page: int, limit: int
) -> tuple[list[dict], int]:
    """Count overdue tasks while retaining only the requested result page."""
    if page < 1 or limit < 1:
        raise ValueError("page and limit must be positive integers")

    start = (page - 1) * limit
    end = start + limit
    total = 0
    page_items = []

    for task in tasks:
        due_date = task.get("due_date")
        task_status = task.get("status", "").lower()
        if due_date and task_status not in ("completed", "done") and due_date < current_date:
            if start <= total < end:
                page_items.append(task)
            total += 1

    return page_items, total


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
