
import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from main import app

client = TestClient(app)


class TestAnalyticsAPI(unittest.TestCase):

    def test_health_endpoint(self):
        response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_productivity_endpoint(self):
        response = client.post(
            "/analytics/productivity",
            json={"activities_file": "activities.jsonl"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_count"], 3)
        self.assertIn("user_101", response.json()["users"])

    def test_overdue_endpoint(self):
        response = client.post(
            "/analytics/overdue",
            json={
                "tasks_file": "tasks.json",
                "current_date": "2026-11-25",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def test_missing_activities_file(self):
        response = client.post(
            "/analytics/productivity",
            json={"activities_file": "missing.jsonl"},
        )

        self.assertEqual(response.status_code, 404)

    def test_missing_tasks_file(self):
        response = client.post(
            "/analytics/overdue",
            json={"tasks_file": "missing.json"},
        )

        self.assertEqual(response.status_code, 404)

    def test_productivity_rejects_unsafe_file_path(self):
        response = client.post(
            "/analytics/productivity",
            json={"activities_file": "../tasks.json"},
        )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
