import json
import tempfile
import unittest
from pathlib import Path

from processor import (
    stream_activities,
    stream_json_array,
    filter_by_organization,
    calculate_productivity,
    find_overdue_tasks,
    paginate_overdue_tasks,
    export_json,
    export_csv,
)


class TestProcessor(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_stream_activities(self):
        file_path = self.base_path / "activities.jsonl"
        file_path.write_text(
            '{"user_id":"u1","action":"task_created"}\n'
            '{"user_id":"u2","action":"task_completed"}\n',
            encoding="utf-8",
        )

        records = list(stream_activities(file_path))
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["user_id"], "u1")

    def test_filter_by_organization_requires_an_explicit_matching_integer(self):
        records = iter([
            {"organization_id": 7, "user_id": "u1"},
            {"organization_id": 8, "user_id": "u2"},
            {"organization_id": "7", "user_id": "u3"},
        ])

        self.assertEqual(
            list(filter_by_organization(records, 7)),
            [{"organization_id": 7, "user_id": "u1"}],
        )

    def test_invalid_json(self):
        file_path = self.base_path / "invalid.jsonl"
        file_path.write_text("not-json\n", encoding="utf-8")

        with self.assertRaises(ValueError):
            list(stream_activities(file_path))

    def test_productivity_metrics(self):
        activities = iter([
            {"user_id": "u1", "action": "task_created"},
            {"user_id": "u1", "action": "task_completed"},
            {"user_id": "u2", "action": "task_updated"},
        ])

        result = calculate_productivity(activities)

        self.assertEqual(result["u1"]["total_activities"], 2)
        self.assertEqual(result["u1"]["completed_tasks"], 1)
        self.assertEqual(result["u2"]["completed_tasks"], 0)

    def test_overdue_tasks(self):
        tasks = iter([
            {"task_id": 1, "status": "pending", "due_date": "2026-11-20"},
            {"task_id": 2, "status": "completed", "due_date": "2026-11-20"},
            {"task_id": 3, "status": "pending", "due_date": "2026-11-28"},
        ])

        result = find_overdue_tasks(tasks, "2026-11-25")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["task_id"], 1)

    def test_stream_json_array_handles_chunked_input(self):
        file_path = self.base_path / "tasks.json"
        file_path.write_text(
            '[{"task_id":1,"status":"todo"},'
            '{"task_id":2,"status":"completed"}]',
            encoding="utf-8",
        )

        self.assertEqual(
            list(stream_json_array(file_path, chunk_size=7)),
            [
                {"task_id": 1, "status": "todo"},
                {"task_id": 2, "status": "completed"},
            ],
        )

    def test_stream_json_array_rejects_invalid_entries_and_trailing_content(self):
        file_path = self.base_path / "invalid-tasks.json"
        file_path.write_text('[{"task_id":1}, 2]', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "JSON object"):
            list(stream_json_array(file_path, chunk_size=5))

        file_path.write_text('[{"task_id":1}] trailing', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Unexpected content"):
            list(stream_json_array(file_path, chunk_size=6))

    def test_overdue_pagination_retains_only_the_requested_page(self):
        tasks = (
            {"task_id": task_id, "status": "todo", "due_date": "2026-11-20"}
            for task_id in range(1, 1001)
        )
        page, total = paginate_overdue_tasks(
            tasks, "2026-11-25", page=4, limit=10
        )

        self.assertEqual(total, 1000)
        self.assertEqual(len(page), 10)
        self.assertEqual(page[0]["task_id"], 31)
        self.assertEqual(page[-1]["task_id"], 40)

    def test_json_export(self):
        output = self.base_path / "output" / "result.json"
        export_json({"total": 5}, output)

        saved = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(saved["total"], 5)

    def test_csv_export(self):
        output = self.base_path / "output" / "result.csv"
        export_csv(
            [{"user_id": "u1", "total_activities": 3}],
            output,
        )

        content = output.read_text(encoding="utf-8")
        self.assertIn("user_id", content)
        self.assertIn("u1", content)


if __name__ == "__main__":
    unittest.main()
