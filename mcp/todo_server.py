#!/usr/bin/env python3
"""MCP server for the todo CLI application.

Exposes the todo CLI as structured tools so Claude Code can manage
tasks via natural language.  Each tool shells out to the `todo` binary
with --json and parses the response.
"""

import json
import subprocess
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("todo")

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def run_todo(*args: str) -> dict:
    """Run the todo CLI with --json and return parsed output."""
    cmd = ["todo"] + [a for a in args if a is not None] + ["--json"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        # Try to parse JSON error from stdout first
        try:
            return json.loads(result.stdout)
        except (json.JSONDecodeError, ValueError):
            pass
        # Fall back to stderr
        err = result.stderr.strip() or f"Command failed with exit code {result.returncode}"
        return {"success": False, "error": err}
    try:
        return json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError):
        return {"success": False, "error": f"Invalid JSON output: {result.stdout[:200]}"}


def _list_prefix(list_name: str | None) -> list[str]:
    """Return the list-name prefix for a command, or empty list."""
    if list_name:
        return [list_name]
    return []


def format_todo(t: dict) -> str:
    """Format a single todo dict into a readable string."""
    status = "completed" if t.get("status") == 1 else "pending"
    priority_map = {1: "low", 2: "medium", 3: "high"}
    priority = priority_map.get(t.get("priority", 0), "none")
    parts = [f"#{t['id']} [{status}] {t['title']}"]
    if t.get("category"):
        parts.append(f"  Category: {t['category']}")
    parts.append(f"  Priority: {priority}")
    if t.get("description"):
        parts.append(f"  Description: {t['description']}")
    if t.get("due_date") and t["due_date"] != 0:
        from datetime import datetime, timezone
        dt = datetime.fromtimestamp(t["due_date"], tz=timezone.utc)
        parts.append(f"  Due: {dt.strftime('%Y-%m-%d %H:%M')}")
    if t.get("repeat_days") and t["repeat_days"] > 0:
        parts.append(f"  Repeats every {t['repeat_days']} day(s)")
    if t.get("repeat_months") and t["repeat_months"] > 0:
        parts.append(f"  Repeats every {t['repeat_months']} month(s)")
    return "\n".join(parts)


def format_todo_list(data: dict) -> str:
    """Format a JSON response containing a list of todos."""
    if not data.get("success"):
        return f"Error: {data.get('error', 'Unknown error')}"
    todos = data.get("todos", [])
    if not todos:
        return "No todos found."
    lines = [f"{data.get('count', len(todos))} todo(s):\n"]
    for t in todos:
        lines.append(format_todo(t))
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def add_task(
    title: str,
    list_name: str | None = None,
    category: str | None = None,
    priority: int | None = None,
    due: str | None = None,
    repeat: str | None = None,
) -> str:
    """Add a new todo task.

    Args:
        title: The task title/description.
        list_name: Named list to add to (e.g. "work", "personal"). Omit for default list.
        category: Category for the task (e.g. "Work", "Shopping").
        priority: Priority level: 1=low, 2=medium, 3=high.
        due: Due date. Accepts YYYY-MM-DD, YYYY-MM-DD HH:MM, or relative: 3d, 2w, 1m, 1y.
        repeat: Repeat interval (e.g. 1d=daily, 7d=weekly, 1m=monthly). Requires due date.
    """
    args = _list_prefix(list_name) + ["--add", title]
    if category:
        args += ["--category", category]
    if priority is not None:
        args += ["--priority", str(priority)]
    if due:
        args += ["--due", due]
    if repeat:
        args += ["--repeat", repeat]
    data = run_todo(*args)
    if data.get("success"):
        return data.get("message", "Task added.")
    return f"Error: {data.get('error', 'Unknown error')}"


@mcp.tool()
def list_tasks(
    list_name: str | None = None,
    category: str | None = None,
    status: str | None = None,
) -> str:
    """List todo tasks with optional filters.

    Args:
        list_name: Named list to show (e.g. "work"). Omit for default list.
        category: Filter by category name.
        status: Filter by status: "pending" or "completed".
    """
    args = _list_prefix(list_name) + ["--list"]
    if category:
        args += ["--category", category]
    if status:
        args += ["--status", status]
    data = run_todo(*args)
    return format_todo_list(data)


@mcp.tool()
def complete_task(id: int, list_name: str | None = None) -> str:
    """Mark a todo task as completed.

    Args:
        id: The task ID number to complete.
        list_name: Named list the task belongs to. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--complete", str(id)]
    data = run_todo(*args)
    if data.get("success"):
        return data.get("message", "Task completed.")
    return f"Error: {data.get('error', 'Unknown error')}"


@mcp.tool()
def delete_task(id: int, list_name: str | None = None) -> str:
    """Delete a todo task.

    Args:
        id: The task ID number to delete.
        list_name: Named list the task belongs to. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--delete", str(id)]
    data = run_todo(*args)
    if data.get("success"):
        return data.get("message", "Task deleted.")
    return f"Error: {data.get('error', 'Unknown error')}"


@mcp.tool()
def edit_task(
    id: int,
    list_name: str | None = None,
    title: str | None = None,
    category: str | None = None,
    priority: int | None = None,
    due: str | None = None,
) -> str:
    """Edit an existing todo task.

    Args:
        id: The task ID number to edit.
        list_name: Named list the task belongs to. Omit for default list.
        title: New title for the task.
        category: New category for the task.
        priority: New priority: 1=low, 2=medium, 3=high.
        due: New due date. Accepts YYYY-MM-DD, YYYY-MM-DD HH:MM, or relative: 3d, 2w, 1m, 1y.
    """
    args = _list_prefix(list_name) + ["--edit", str(id)]
    if title:
        args += ["--title", title]
    if category:
        args += ["--category", category]
    if priority is not None:
        args += ["--priority", str(priority)]
    if due:
        args += ["--due", due]
    data = run_todo(*args)
    if data.get("success"):
        return data.get("message", "Task updated.")
    return f"Error: {data.get('error', 'Unknown error')}"


@mcp.tool()
def show_task(id: int, list_name: str | None = None) -> str:
    """Show full details of a specific todo task.

    Args:
        id: The task ID number to show.
        list_name: Named list the task belongs to. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--show", str(id)]
    data = run_todo(*args)
    if not data.get("success"):
        return f"Error: {data.get('error', 'Unknown error')}"
    todo = data.get("todo")
    if todo:
        return format_todo(todo)
    return "Task not found."


@mcp.tool()
def move_task(id: int, target_list: str, list_name: str | None = None) -> str:
    """Move a todo task to a different named list.

    Args:
        id: The task ID number to move (or comma-separated IDs like [1,2,3] for batch).
        target_list: The destination list name (e.g. "work", "personal").
        list_name: Source list the task is in. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--move", str(id), target_list]
    data = run_todo(*args)
    if data.get("success"):
        return data.get("message", "Task moved.")
    return f"Error: {data.get('error', 'Unknown error')}"


@mcp.tool()
def show_lists() -> str:
    """Show all available todo lists."""
    data = run_todo("--lists")
    if not data.get("success"):
        return f"Error: {data.get('error', 'Unknown error')}"
    lists = data.get("lists", [])
    if not lists:
        return "No lists found."
    return "Available lists:\n" + "\n".join(f"  - {name}" for name in lists)


@mcp.tool()
def delete_list(name: str) -> str:
    """Delete an empty named todo list.

    Args:
        name: The list name to delete. The list must be empty.
    """
    data = run_todo("--delete-list", name)
    if data.get("success"):
        return data.get("message", f"Deleted list '{name}'.")
    return f"Error: {data.get('error', 'Unknown error')}"


@mcp.tool()
def show_today(list_name: str | None = None) -> str:
    """Show todos due today.

    Args:
        list_name: Named list to check. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--today"]
    data = run_todo(*args)
    return format_todo_list(data)


@mcp.tool()
def show_week(list_name: str | None = None) -> str:
    """Show todos due within the next 7 days.

    Args:
        list_name: Named list to check. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--week"]
    data = run_todo(*args)
    return format_todo_list(data)


@mcp.tool()
def show_schedule(list_name: str | None = None) -> str:
    """Show all scheduled todos (with due dates) ordered by date.

    Args:
        list_name: Named list to check. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--schedule"]
    data = run_todo(*args)
    return format_todo_list(data)


@mcp.tool()
def show_categories(list_name: str | None = None) -> str:
    """Show all categories used in a todo list.

    Args:
        list_name: Named list to check. Omit for default list.
    """
    args = _list_prefix(list_name) + ["--cat"]
    data = run_todo(*args)
    if not data.get("success"):
        return f"Error: {data.get('error', 'Unknown error')}"
    categories = data.get("categories", [])
    if not categories:
        return "No categories found."
    return "Categories:\n" + "\n".join(f"  - {cat}" for cat in categories)


if __name__ == "__main__":
    mcp.run()
