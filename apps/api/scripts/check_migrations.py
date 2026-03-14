#!/usr/bin/env python3
"""
Migration safety checker.

Scans Alembic migration files for destructive operations and enforces safety rules:
  1. DROP TABLE / DROP COLUMN → requires MANUAL_APPROVAL comment
  2. ALTER TABLE ... ALTER COLUMN (type change without DEFAULT) → flagged
  3. Renaming a column without ADD + data-copy → flagged
  4. Missing downgrade() implementation → warning
  5. Migrations touching >5 tables → warning (high blast radius)

Exit codes:
  0 — All checks passed (or only warnings)
  1 — At least one ERROR found (blocks CI)

Usage:
  python scripts/check_migrations.py [--path alembic/versions] [--strict]

  --strict    Treat warnings as errors (recommended for production branches)
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ─── Patterns ─────────────────────────────────────────────────────────────────

# Destructive DDL patterns — always flagged as ERROR unless approved
_DESTRUCTIVE_PATTERNS: list[tuple[str, str]] = [
    (r"\bdrop\s+table\b", "DROP TABLE"),
    (r"\bdrop\s+column\b", "DROP COLUMN"),
    (r"\bdrop_table\s*\(", "op.drop_table()"),
    (r"\bdrop_column\s*\(", "op.drop_column()"),
    (r"\bdrop_constraint\s*\(", "op.drop_constraint()"),
    (r"\btruncate\b", "TRUNCATE"),
]

# Risky patterns — flagged as WARNING (use --strict to elevate to ERROR)
_RISKY_PATTERNS: list[tuple[str, str]] = [
    (r"\balter\s+column\b", "ALTER COLUMN (type change may lose data)"),
    (r"\balter_column\s*\(.*type_=", "op.alter_column(type_=...) — data type change"),
    (r"\brename_column\s*\(", "op.rename_column() — ensure no live queries use old name"),
    (r"\brename_table\s*\(", "op.rename_table() — ensure no live queries use old name"),
    (r"not\s+null\b(?!.*server_default|.*default)", "NOT NULL without DEFAULT — breaks live writes"),
]

# Approval marker that suppresses DESTRUCTIVE errors
_APPROVAL_COMMENT = "MANUAL_APPROVAL"  # add "# MANUAL_APPROVAL" in the migration file

# Count unique table names touched
_TABLE_PATTERN = re.compile(
    r"""(?:op\.(?:create|drop|alter|add|rename)_(?:table|column|constraint|index))\s*\(\s*['"](\w+)['"]""",
    re.IGNORECASE,
)

# Detect empty downgrade()
_EMPTY_DOWNGRADE = re.compile(
    r"""def\s+downgrade\s*\(\s*\)\s*:\s*\n\s*(pass|#[^\n]*)""",
    re.MULTILINE,
)


# ─── Data classes ─────────────────────────────────────────────────────────────


@dataclass
class Finding:
    level: str          # "ERROR" | "WARNING" | "INFO"
    file: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.level:7s} {self.file}:{self.line} — {self.message}"


@dataclass
class CheckResult:
    findings: list[Finding] = field(default_factory=list)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "ERROR"]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "WARNING"]

    def add(self, level: str, file: str, line: int, message: str) -> None:
        self.findings.append(Finding(level, file, line, message))


# ─── Checker ──────────────────────────────────────────────────────────────────


def _split_upgrade_downgrade(lines: list[str]) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """
    Split migration lines into upgrade and downgrade sections.
    Returns (upgrade_lines, downgrade_lines) as (line_number, line_text) tuples.
    Lines before the first def are included in upgrade for safety.
    """
    upgrade: list[tuple[int, str]] = []
    downgrade: list[tuple[int, str]] = []
    in_downgrade = False

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.match(r"def\s+downgrade\s*\(", stripped):
            in_downgrade = True
        elif re.match(r"def\s+upgrade\s*\(", stripped):
            in_downgrade = False

        if in_downgrade:
            downgrade.append((i, line))
        else:
            upgrade.append((i, line))

    return upgrade, downgrade


def check_migration(path: Path, strict: bool, result: CheckResult) -> None:
    """Analyze a single Alembic migration file."""
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    has_approval = _APPROVAL_COMMENT in content
    fname = path.name

    upgrade_lines, _downgrade_lines = _split_upgrade_downgrade(lines)

    # 1. Destructive patterns — only flagged in upgrade() block
    for pattern, label in _DESTRUCTIVE_PATTERNS:
        for i, line in upgrade_lines:
            if re.search(pattern, line, re.IGNORECASE):
                if has_approval:
                    result.add("INFO", fname, i, f"{label} — approved (MANUAL_APPROVAL present)")
                else:
                    result.add(
                        "ERROR",
                        fname,
                        i,
                        f"{label} in upgrade() — add '# {_APPROVAL_COMMENT}' comment to confirm this is intentional",
                    )

    # 2. Risky patterns — only in upgrade() block
    for pattern, label in _RISKY_PATTERNS:
        for i, line in upgrade_lines:
            if re.search(pattern, line, re.IGNORECASE):
                level = "ERROR" if strict else "WARNING"
                result.add(level, fname, i, label)

    # 3. Empty downgrade
    if _EMPTY_DOWNGRADE.search(content):
        level = "ERROR" if strict else "WARNING"
        result.add(level, fname, 0, "downgrade() is empty — rollback will be a no-op")

    # 4. High blast radius (>5 tables)
    touched_tables = set(_TABLE_PATTERN.findall(content))
    if len(touched_tables) > 5:
        result.add(
            "WARNING",
            fname,
            0,
            f"Migration touches {len(touched_tables)} tables ({', '.join(sorted(touched_tables))}) — "
            "consider splitting into smaller migrations",
        )


def check_all(versions_dir: Path, strict: bool) -> CheckResult:
    result = CheckResult()
    migration_files = sorted(versions_dir.glob("*.py"))

    if not migration_files:
        print(f"No migration files found in {versions_dir}")
        return result

    for migration in migration_files:
        if migration.name.startswith("_"):
            continue  # skip __init__.py etc.
        check_migration(migration, strict, result)

    return result


# ─── CLI ──────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Alembic migration safety checker",
    )
    parser.add_argument(
        "--path",
        default="alembic/versions",
        help="Path to Alembic versions directory (default: alembic/versions)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors (recommended for production merges)",
    )
    parser.add_argument(
        "--changed-only",
        metavar="FILE",
        help="Only check files listed in FILE (one per line, for CI diff mode)",
    )
    args = parser.parse_args()

    versions_dir = Path(args.path)
    if not versions_dir.is_dir():
        print(f"ERROR: {versions_dir} is not a directory", file=sys.stderr)
        return 1

    # If --changed-only is provided, filter to those files
    if args.changed_only:
        changed_file = Path(args.changed_only)
        if changed_file.is_file():
            changed = {line.strip() for line in changed_file.read_text().splitlines() if line.strip()}
        else:
            changed = set()
        # Only keep migration files that appear in the changed list
        orig_glob = sorted(versions_dir.glob("*.py"))
        files_to_check = [f for f in orig_glob if f.name in changed or str(f) in changed]
        if not files_to_check:
            print("No changed migration files to check.")
            return 0
    else:
        files_to_check = None  # check all

    if files_to_check is not None:
        result = CheckResult()
        for f in files_to_check:
            check_migration(f, args.strict, result)
    else:
        result = check_all(versions_dir, args.strict)

    # Output
    if not result.findings:
        print(f"OK No issues found in {versions_dir}")
        return 0

    errors = result.errors
    warnings = result.warnings
    infos = [f for f in result.findings if f.level == "INFO"]

    for finding in result.findings:
        prefix = {"ERROR": "[ERROR]", "WARNING": "[WARN] ", "INFO": "[INFO] "}.get(finding.level, "       ")
        print(f"{prefix} {finding}")

    print()
    print(f"Summary: {len(errors)} error(s), {len(warnings)} warning(s), {len(infos)} info(s)")

    if errors:
        print()
        print("CI BLOCKED: Fix the errors above before merging this migration.")
        print("  - For intentional DROP/TRUNCATE: add `# MANUAL_APPROVAL` comment in the migration file")
        print("  - For type changes: ensure DEFAULT or nullable=True is set")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
