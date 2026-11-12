import json
import os
import uuid
from datetime import datetime


# ==================================
# Storage Config
# ==================================

ASSIGNMENTS_FILE = "assignments.json"


# ==================================
# File Helpers
# ==================================

def load_assignments():
    """Load assignments from JSON file."""
    if not os.path.exists(ASSIGNMENTS_FILE):
        return []
    try:
        with open(ASSIGNMENTS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []


def save_assignments(assignments):
    """Save assignments to JSON file."""
    with open(ASSIGNMENTS_FILE, "w") as f:
        json.dump(assignments, f, indent=2)


# ==================================
# CRUD Operations
# ==================================

def create_assignment(doc_name, assignee, due_date, assigned_by="Manager"):
    """Create a new KT assignment."""
    assignments = load_assignments()

    new_assignment = {
        "id": str(uuid.uuid4()),
        "document": doc_name,
        "assignee": assignee,
        "assigned_by": assigned_by,
        "due_date": due_date,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "completed_at": None
    }

    assignments.append(new_assignment)
    save_assignments(assignments)

    return new_assignment


def get_all_assignments():
    """Return all assignments sorted by created_at descending."""
    assignments = load_assignments()
    return sorted(
        assignments,
        key=lambda x: x.get("created_at", ""),
        reverse=True
    )


def mark_complete(assignment_id):
    """Mark an assignment as completed."""
    assignments = load_assignments()

    for assignment in assignments:
        if assignment["id"] == assignment_id:
            assignment["status"] = "completed"
            assignment["completed_at"] = datetime.now().isoformat()
            save_assignments(assignments)
            return assignment

    return None


def delete_assignment(assignment_id):
    """Delete an assignment by ID."""
    assignments = load_assignments()
    original_count = len(assignments)

    assignments = [
        a for a in assignments
        if a["id"] != assignment_id
    ]

    if len(assignments) < original_count:
        save_assignments(assignments)
        return True

    return False


def get_assignment_stats():
    """Return summary statistics for assignments."""
    assignments = load_assignments()

    total = len(assignments)
    completed = sum(1 for a in assignments if a["status"] == "completed")
    pending = total - completed

    return {
        "total": total,
        "completed": completed,
        "pending": pending,
        "completion_rate": round((completed / total * 100), 1) if total > 0 else 0
    }
