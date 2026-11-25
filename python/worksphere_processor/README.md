# WorkSphere Activity Processor

A reusable Python package for processing WorkSphere task activity exports.

## Features
- Stream large JSONL activity files.
- Calculate productivity metrics by user.
- Identify overdue tasks.
- Export reports as JSON and CSV.
- Validate malformed JSON.
- Benchmark processing speed and memory.

## Run Sample
From the project root:

    python python/worksphere_processor/run_sample.py

## Run Tests

    $env:PYTHONPATH = "$PWD\python\worksphere_processor"
    python -m unittest discover -s python/worksphere_processor/tests -v

## Run Benchmark

    python python/worksphere_processor/benchmarks/benchmark.py

## Input
Activities use JSONL format (one JSON object per line).
Tasks use a JSON array with task ID, title, status, and due date.

## Design
Activity records are processed incrementally using a generator.
Productivity metrics are aggregated by user.
Overdue tasks are identified using their due dates.

All sample data is synthetic.
