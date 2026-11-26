import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

import main
from main import app
from rate_limit import FixedWindowRateLimiter

client = TestClient(app)


class TestAnalyticsAPI(unittest.TestCase):

    def test_openapi_documents_version_pagination_rate_limits_and_errors(self):
        response = client.get("/openapi.json")

        self.assertEqual(response.status_code, 200)
        document = response.json()
        self.assertEqual(document["info"]["version"], "1.0.0")
        self.assertEqual(
            document["x-api-versioning"]["versionedPrefix"], "/v1"
        )
        self.assertEqual(document["x-rate-limit-policy"]["status"], "enforced")
        self.assertIn("/analytics/productivity", document["paths"])
        self.assertIn("/v1/analytics/productivity", document["paths"])

        productivity = document["paths"]["/v1/analytics/productivity"]["post"]
        activities_file = document["components"]["schemas"]["ProductivityRequest"][
            "properties"
        ]["activities_file"]
        self.assertIn("examples", activities_file)
        self.assertIn("422", productivity["responses"])
        self.assertIn("400", productivity["responses"])
        self.assertIn("429", productivity["responses"])
        self.assertEqual(
            {parameter["name"] for parameter in productivity["parameters"]},
            {"page", "limit"},
        )

    def test_swagger_ui_is_available(self):
        response = client.get("/docs")

        self.assertEqual(response.status_code, 200)
        self.assertIn("swagger-ui", response.text)

    def test_health_endpoint_supports_legacy_and_v1_paths(self):
        legacy = client.get("/health")
        versioned = client.get("/v1/health")

        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(versioned.status_code, 200)
        self.assertEqual(versioned.json(), legacy.json())
        self.assertIn("RateLimit-Limit", versioned.headers)
        self.assertIn("RateLimit-Remaining", versioned.headers)

    def test_productivity_endpoint(self):
        response = client.post(
            "/analytics/productivity",
            json={"activities_file": "activities.jsonl"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_count"], 3)
        self.assertIn("user_101", response.json()["users"])
        self.assertEqual(response.json()["pagination"]["total"], 3)

    def test_productivity_paginates_and_supports_v1_alias(self):
        first_page = client.post(
            "/v1/analytics/productivity?page=1&limit=2",
            json={"activities_file": "activities.jsonl"},
        )
        second_page = client.post(
            "/v1/analytics/productivity?page=2&limit=2",
            json={"activities_file": "activities.jsonl"},
        )

        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(list(first_page.json()["users"]), ["user_101", "user_102"])
        self.assertEqual(first_page.json()["pagination"], {
            "page": 1,
            "limit": 2,
            "total": 3,
            "totalPages": 2,
            "hasNext": True,
            "hasPrevious": False,
        })
        self.assertEqual(second_page.status_code, 200)
        self.assertEqual(list(second_page.json()["users"]), ["user_103"])
        self.assertTrue(second_page.json()["pagination"]["hasPrevious"])

    def test_pagination_rejects_invalid_and_out_of_range_parameters(self):
        invalid_page = client.post(
            "/analytics/productivity?page=0",
            json={"activities_file": "activities.jsonl"},
        )
        invalid_limit = client.post(
            "/analytics/productivity?limit=101",
            json={"activities_file": "activities.jsonl"},
        )
        out_of_range = client.post(
            "/analytics/productivity?page=99&limit=2",
            json={"activities_file": "activities.jsonl"},
        )

        self.assertEqual(invalid_page.status_code, 422)
        self.assertEqual(invalid_limit.status_code, 422)
        self.assertEqual(out_of_range.status_code, 200)
        self.assertEqual(out_of_range.json()["users"], {})
        self.assertFalse(out_of_range.json()["pagination"]["hasNext"])

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
        self.assertEqual(response.json()["pagination"]["total"], 1)

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

    def test_rate_limit_returns_429_headers_and_recovers_after_window(self):
        current_time = [1000.0]
        limiter = FixedWindowRateLimiter(
            1,
            60,
            clock=lambda: current_time[0],
        )

        with patch.object(main, "rate_limiter", limiter):
            first = client.get("/v1/health")
            limited = client.get("/v1/health")

            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.headers["RateLimit-Limit"], "1")
            self.assertEqual(first.headers["RateLimit-Remaining"], "0")
            self.assertEqual(limited.status_code, 429)
            self.assertEqual(limited.headers["Retry-After"], "20")
            self.assertEqual(limited.json()["detail"], "Rate limit exceeded. Please retry later.")

            current_time[0] += 60
            after_reset = client.get("/v1/health")
            self.assertEqual(after_reset.status_code, 200)


if __name__ == "__main__":
    unittest.main()
