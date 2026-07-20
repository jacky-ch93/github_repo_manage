import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FALLBACK_CATEGORY,
  MAX_ACADEMIC_CATEGORIES,
  classifyRepository,
  repositoryCategories,
} from "./classify-repository.mjs";

const taxonomy = JSON.parse(
  await readFile(new URL("../config/academic-taxonomy.json", import.meta.url), "utf8"),
).categories;

test("classifies repository content into academic fields", () => {
  const repo = {
    name: "robot-vision",
    description: "6D pose estimation for robotic manipulation",
    topics: ["robotics", "computer-vision"],
    language: "C++",
  };
  const content = {
    readme: "ROS motion planning with point-cloud object detection and PyTorch inference.",
    paths: ["robot.urdf", "launch/control.launch.py", "src/vision/detector.cpp"],
  };

  const categories = classifyRepository(repo, content, taxonomy);
  assert.ok(categories.includes("机器人学"));
  assert.ok(categories.includes("计算机视觉"));
  assert.ok(categories.length <= MAX_ACADEMIC_CATEGORIES);
});

test("uses the fallback when no academic signal reaches the threshold", () => {
  const categories = classifyRepository(
    { name: "notes", description: "", topics: [], language: null },
    { readme: "personal notes", paths: ["README.md"] },
    taxonomy,
  );
  assert.deepEqual(categories, [FALLBACK_CATEGORY]);
});

test("does not treat standard-library tokenize files as LLM evidence", () => {
  const categories = classifyRepository(
    { name: "XX-Net", description: "a web proxy tool", topics: [], language: "Python" },
    {
      readme: "A web proxy and tunnel.",
      paths: ["python27/lib/tokenize.py", "python27/lib/win32/cffi/_embedding.h"],
    },
    taxonomy,
  );
  assert.ok(!categories.includes("自然语言处理与大模型"));
  assert.ok(categories.includes("分布式系统与网络"));
});

test("reads both multi-label and legacy repository records", () => {
  assert.deepEqual(repositoryCategories({ categories: ["计算机视觉", "机器人学"] }), ["计算机视觉", "机器人学"]);
  assert.deepEqual(repositoryCategories({ category: "机器学习" }), ["机器学习"]);
});
