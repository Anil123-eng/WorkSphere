import json
import tempfile
import time
import tracemalloc
from pathlib import Path

from processor import stream_activities, calculate_productivity


def run_benchmark(record_count=100000):
    with tempfile.TemporaryDirectory() as temp_dir:
        file_path = Path(temp_dir) / "large_activities.jsonl"

        print(f"Generating {record_count:,} sample activities...")

        with file_path.open("w", encoding="utf-8") as file:
            for index in range(record_count):
                record = {
                    "activity_id": index,
                    "user_id": f"user_{index % 100}",
                    "task_id": index,
                    "action": (
                        "task_completed"
                        if index % 3 == 0
                        else "task_updated"
                    ),
                }
                file.write(json.dumps(record) + "\n")

        tracemalloc.start()
        start_time = time.perf_counter()

        results = calculate_productivity(stream_activities(file_path))

        elapsed = time.perf_counter() - start_time
        current_memory, peak_memory = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        print("\n--- WorkSphere Processing Benchmark ---")
        print(f"Records processed: {record_count:,}")
        print(f"Users analyzed: {len(results)}")
        print(f"Processing time: {elapsed:.4f} seconds")
        print(f"Throughput: {record_count / elapsed:,.0f} records/second")
        print(f"Peak memory: {peak_memory / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    run_benchmark()
