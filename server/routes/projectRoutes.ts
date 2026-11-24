
import { Router, Request, Response } from "express";

const router = Router();

interface Project {
  id: number;
  name: string;
  description: string;
}

const projects: Project[] = [];

// GET all projects
router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: projects,
  });
});

// GET project by ID
router.get("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      success: false,
      message: "Invalid project ID",
    });
    return;
  }

  const project = projects.find((item) => item.id === id);

  if (!project) {
    res.status(404).json({
      success: false,
      message: "Project not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: project,
  });
});

// POST create project
router.post("/", (req: Request, res: Response) => {
  const { name, description } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({
      success: false,
      message: "Project name is required",
    });
    return;
  }

  const project: Project = {
    id: Date.now(),
    name: name.trim(),
    description:
      typeof description === "string" ? description.trim() : "",
  };

  projects.push(project);

  res.status(201).json({
    success: true,
    message: "Project created successfully",
    data: project,
  });
});

// PUT update project
router.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      success: false,
      message: "Invalid project ID",
    });
    return;
  }

  const project = projects.find((item) => item.id === id);

  if (!project) {
    res.status(404).json({
      success: false,
      message: "Project not found",
    });
    return;
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({
      success: false,
      message: "Project name is required",
    });
    return;
  }

  project.name = name.trim();

  if (typeof description === "string") {
    project.description = description.trim();
  }

  res.status(200).json({
    success: true,
    message: "Project updated successfully",
    data: project,
  });
});

// DELETE project
router.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      success: false,
      message: "Invalid project ID",
    });
    return;
  }

  const index = projects.findIndex((item) => item.id === id);

  if (index === -1) {
    res.status(404).json({
      success: false,
      message: "Project not found",
    });
    return;
  }

  projects.splice(index, 1);

  res.status(200).json({
    success: true,
    message: "Project deleted successfully",
  });
});

export default router;
