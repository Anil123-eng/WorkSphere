import json
from pathlib import Path

from processor import (
    stream_activities,
    calculate_productivity,
    find_overdue_tasks,
    export_json,
    export_csv,
)

BASE_DIR = Path(__file__).parent
SAMPLES_DIR = BASE_DIR / "samples"
OUTPUT_DIR = SAMPLES_DIR / "output"

activities = stream_activities(SAMPLES_DIR / "activities.jsonl")
productivity = calculate_productivity(activities)

with (SAMPLES_DIR / "tasks.json").open("r", encoding="utf-8-sig") as file:
    tasks = json.load(file)

overdue = find_overdue_tasks(iter(tasks), "2026-11-25")

export_json(productivity, OUTPUT_DIR / "productivity.json")
export_json(overdue, OUTPUT_DIR / "overdue_tasks.json")
export_csv(overdue, OUTPUT_DIR / "overdue_tasks.csv")

print("Sample processing completed.")
print(f"Productivity report: {OUTPUT_DIR / 'productivity.json'}")
print(f"Overdue tasks: {len(overdue)}")
print(f"Reports saved in: {OUTPUT_DIR}")
